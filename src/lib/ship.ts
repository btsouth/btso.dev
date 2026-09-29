// Projects, releases and activity for the homepage, ship log and project pages.
// projects.json is the opt-in list; github.json is the snapshot written by
// scripts/fetch-github.mjs (refreshed hourly by the refresh-github-data workflow).
import projectList from '../data/projects.json';
import github from '../data/github.json';

export type Group = 'omarchy' | 'windows' | 'ai';
export const GROUPS: Record<Group, string> = { omarchy: 'Omarchy', windows: 'Windows', ai: 'AI & dev tools' };

type ProjectMeta = {
  id: string;
  repo: string;
  name: string;
  group: string;
  accent: string;
  tagline: string;
  site?: string;
  icon?: string;
  shot?: string;
  install?: string;
};

type RepoData = {
  stars: number;
  pushedAt: string;
  latest: string | null;
  releaseDates: string[];
  releases: { tag: string; title: string | null; at: string; pre: boolean; url: string; body: string }[];
};

export type Project = Omit<ProjectMeta, 'group'> & {
  group: Group;
  stars: number;
  pushedAt: string;
  version: string | null;
  releasedAt: string | null;
  releaseDates: string[];
};

export type Release = {
  project: Project;
  tag: string;
  at: string;
  pre: boolean;
  url: string;
  body: string;
};

const repos = github.repos as Record<string, RepoData>;

// Release tags end up in copyable shell commands, so only plain version-like
// tags are substituted; anything else falls back to the default branch.
const SAFE_TAG = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export const projects: Project[] = (projectList as ProjectMeta[]).map((meta) => {
  const data = repos[meta.repo];
  const version = data?.latest ?? null;
  return {
    ...meta,
    group: meta.group as Group,
    install: meta.install?.replace('{version}', version && SAFE_TAG.test(version) ? version : 'main'),
    stars: data?.stars ?? 0,
    pushedAt: data?.pushedAt ?? '',
    version,
    releasedAt: data?.releaseDates[0] ?? null,
    releaseDates: data?.releaseDates ?? [],
  };
});

export const projectById = Object.fromEntries(projects.map((p) => [p.id, p])) as Record<string, Project>;

export const releases: Release[] = projects
  .flatMap((project) => (repos[project.repo]?.releases ?? []).map((r) => ({ project, tag: r.tag, at: r.at, pre: r.pre, url: r.url, body: r.body })))
  .sort((a, b) => b.at.localeCompare(a.at));

export const days = github.days as [string, number][];
export const generatedAt = github.generatedAt as string;

const DAY = 864e5;
const now = Date.parse(generatedAt);
export const within = (iso: string, daysBack: number) => now - Date.parse(iso) < daysBack * DAY;

export const stats = {
  releases30: releases.filter((r) => within(r.at, 30)).length,
  releases7: releases.filter((r) => within(r.at, 7)).length,
  shipping30: new Set(releases.filter((r) => within(r.at, 30)).map((r) => r.project.id)).size,
  stars: projects.reduce((n, p) => n + p.stars, 0),
  contributions: days.reduce((n, [, c]) => n + c, 0),
};

/** Release counts in `bins` equal buckets over the last `span` days, oldest first. */
export function releaseBins(p: Project, bins = 45, span = 90) {
  const out = new Array(bins).fill(0);
  for (const d of p.releaseDates) {
    const age = (now - Date.parse(d)) / DAY;
    if (age >= 0 && age < span) out[bins - 1 - Math.floor(age / (span / bins))]++;
  }
  return out as number[];
}

/** Releases per week for the last `weeks` weeks, oldest first. */
export function releasesPerWeek(weeks = 12) {
  const out: { label: string; count: number }[] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const end = now - w * 7 * DAY;
    const start = end - 7 * DAY;
    const count = projects.reduce((n, p) => n + p.releaseDates.filter((d) => { const t = Date.parse(d); return t >= start && t < end; }).length, 0);
    out.push({ label: new Date(start + DAY).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }), count });
  }
  return out;
}

export const initials = (name: string) =>
  name.replace(/[^A-Za-z ]/g, ' ').trim().split(/\s+|(?=[A-Z])/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

/* ---------- Release notes: just enough Markdown for GitHub release bodies ---------- */

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function inline(s: string, repo: string) {
  return esc(s)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" rel="noreferrer">$1</a>')
    .replace(/(^|[\s(])#(\d{1,5})\b/g, `$1<a class="iss" href="https://github.com/${repo}/issues/$2" rel="noreferrer">#$2</a>`)
    .replace(/(^|[\s(])@([A-Za-z0-9-]{2,39})\b/g, '$1<a href="https://github.com/$2" rel="noreferrer">@$2</a>');
}

export function notesHtml(body: string, project: Project) {
  const out: string[] = [];
  let list: string[] | null = null;
  let para: string[] = [];
  let code: string[] | null = null;
  const flushPara = () => { if (para.length) { out.push(`<p>${inline(para.join(' '), project.repo)}</p>`); para = []; } };
  const flushList = () => { if (list) { out.push(`<ul>${list.map((l) => `<li>${inline(l, project.repo)}</li>`).join('')}</ul>`); list = null; } };
  for (const line of body.split('\n')) {
    const t = line.trimEnd();
    // Fenced code blocks, kept verbatim.
    if (/^\s*```/.test(t)) {
      if (code) { out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`); code = null; } else { flushPara(); flushList(); code = []; }
      continue;
    }
    if (code) { code.push(line); continue; }
    if (!t.trim()) { flushPara(); flushList(); continue; }
    const heading = t.match(/^#{1,6}\s+(.*)/);
    if (heading) {
      flushPara(); flushList();
      // Skip a heading that only repeats the app name and version, including a
      // shorter form of the name ("Try Omarchy v0.6.0" for Try Omarchy for Windows).
      const title = heading[1].toLowerCase(), name = project.name.toLowerCase();
      if (!title.startsWith(name) && !name.startsWith(title.replace(/\s+v?\d[\w.-]*$/, ''))) out.push(`<h5>${inline(heading[1], project.repo)}</h5>`);
      continue;
    }
    const bullet = t.match(/^\s*(?:[-*+]|\d+\.)\s+(.*)/);
    if (bullet) { flushPara(); (list ??= []).push(bullet[1]); continue; }
    if (list && /^\s+\S/.test(line)) { list[list.length - 1] += ' ' + t.trim(); continue; }
    flushList();
    para.push(t.trim());
  }
  if (code) out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`);
  flushPara(); flushList();
  return out.join('') || '<p>No notes for this one.</p>';
}

/** First sentence-ish of a release body, as plain text. */
export const notesSummary = (body: string, max = 180) =>
  body
    .replace(/```[\s\S]*?(```|$)/g, '')
    .replace(/^#.*$/gm, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s*>\s?/gm, '')
    .replace(/[*`]/g, '')
    .replace(/^\s*[-+]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max) || 'Release notes on GitHub.';
