// Snapshot the public GitHub data the site renders: stars, releases and the
// contribution calendar for every repo in src/data/projects.json.
// Needs GITHUB_TOKEN (any token that can read public data). Writes
// src/data/github.json only when the data changed, so the hourly workflow
// commits nothing on quiet hours.
//
//   GITHUB_TOKEN=... node scripts/fetch-github.mjs [--check]
//
// --check fetches and validates without writing (used on pull requests).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const LOGIN = 'btsouth';
const OUT = new URL('../src/data/github.json', import.meta.url);
const projects = JSON.parse(readFileSync(new URL('../src/data/projects.json', import.meta.url), 'utf8'));
const check = process.argv.includes('--check');
const token = process.env.GITHUB_TOKEN;
if (!token) {
  console.error('GITHUB_TOKEN is not set.');
  process.exit(1);
}

const repoFields = `nameWithOwner stargazerCount pushedAt
  releases(first: 100, orderBy: { field: CREATED_AT, direction: DESC }) {
    nodes { tagName name createdAt publishedAt isPrerelease isDraft description url }
  }`;
const query = `query {
  ${projects.map((p, i) => {
    const [owner, name] = p.repo.split('/');
    return `r${i}: repository(owner: "${owner}", name: "${name}") { ${repoFields} }`;
  }).join('\n  ')}
  user(login: "${LOGIN}") {
    contributionsCollection { contributionCalendar { weeks { contributionDays { date contributionCount } } } }
  }
}`;

const res = await fetch('https://api.github.com/graphql', {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'btso-dev-site' },
  body: JSON.stringify({ query }),
});
const json = await res.json();
if (!res.ok || json.errors) {
  console.error('GitHub query failed:', JSON.stringify(json.errors ?? json, null, 2));
  process.exit(1);
}

// Keep release notes to what the site shows, and drop the boilerplate footer.
const cleanNotes = (body) =>
  (body || '')
    .replace(/\r/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^\*\*Full Changelog\*\*.*$/gim, '')
    .replace(/^\[Full changelog\]\(.*\)$/gim, '')
    .trim()
    .slice(0, 1600);

const cutoff = new Date(Date.now() - 180 * 864e5).toISOString();
const repos = {};
projects.forEach((p, i) => {
  const r = json.data[`r${i}`];
  if (!r) throw new Error(`Repository not found: ${p.repo}`);
  // Date releases by when they were published: drafts can sit for a while first.
  const releases = r.releases.nodes
    .filter((n) => !n.isDraft)
    .map((n) => ({ ...n, at: n.publishedAt ?? n.createdAt }))
    .sort((a, b) => b.at.localeCompare(a.at));
  repos[p.repo] = {
    stars: r.stargazerCount,
    pushedAt: r.pushedAt,
    latest: releases[0]?.tagName ?? null,
    releaseDates: releases.map((n) => n.at),
    releases: releases
      .filter((n) => n.at >= cutoff)
      .map((n) => ({ tag: n.tagName, title: n.name, at: n.at, pre: n.isPrerelease, url: n.url, body: cleanNotes(n.description) })),
  };
});
const days = json.data.user.contributionsCollection.contributionCalendar.weeks.flatMap((w) =>
  w.contributionDays.map((d) => [d.date, d.contributionCount]),
);

const data = { repos, days };
const releaseCount = Object.values(repos).reduce((n, r) => n + r.releases.length, 0);
console.log(`${projects.length} repos, ${releaseCount} recent releases, ${days.length} calendar days.`);
if (check) process.exit(0);

const previous = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : null;
if (previous && JSON.stringify({ repos: previous.repos, days: previous.days }) === JSON.stringify(data)) {
  console.log('No changes.');
  process.exit(0);
}
writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), ...data }, null, 1) + '\n');
console.log('Wrote src/data/github.json');
