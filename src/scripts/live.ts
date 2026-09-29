// Live activity from GitHub's public events feed, polled while the tab is visible.
// Browser-side conditional requests keep unchanged polls off the rate limit.
// GitHub caches this endpoint for up to five minutes, so events appear within
// about five minutes of happening.
import { ago } from '../lib/time';

type GhEvent = {
  id: string;
  type: string;
  created_at: string;
  repo?: { name: string };
  payload?: {
    action?: string;
    ref?: string;
    ref_type?: string;
    release?: { tag_name?: string };
    pull_request?: { merged?: boolean };
  };
};

export type Activity = { text: string; release: boolean; name: string; tag?: string };

const URL_ = 'https://api.github.com/users/btsouth/events/public?per_page=15';

export function describe(e: GhEvent, repos: Record<string, { name: string }>): Activity | null {
  const name = repos[e.repo?.name ?? '']?.name ?? (e.repo?.name ?? '').split('/')[1] ?? 'a repo';
  const pl = e.payload ?? {};
  const base = { release: false, name };
  switch (e.type) {
    case 'PushEvent': {
      const branch = (pl.ref ?? '').replace('refs/heads/', '');
      return { ...base, text: `pushed to ${name}${branch && !/^(main|master)$/.test(branch) ? ` · ${branch}` : ''}` };
    }
    case 'ReleaseEvent':
      if (pl.action && pl.action !== 'published') return null;
      return { release: true, name, tag: pl.release?.tag_name, text: `released ${name} ${pl.release?.tag_name ?? ''}`.trim() };
    case 'PullRequestEvent': {
      const action = pl.action === 'closed' && pl.pull_request?.merged ? 'merged' : pl.action;
      return { ...base, text: `${action} a pull request in ${name}` };
    }
    case 'PullRequestReviewEvent': return { ...base, text: `reviewed a pull request in ${name}` };
    case 'CreateEvent':
      if (pl.ref_type === 'tag') return { ...base, text: `tagged ${name} ${pl.ref}` };
      if (pl.ref_type === 'repository') return { ...base, text: `created ${name}` };
      return { ...base, text: `started a branch in ${name}` };
    case 'IssuesEvent': return { ...base, text: `${pl.action} an issue in ${name}` };
    case 'IssueCommentEvent': return { ...base, text: `commented in ${name}` };
    case 'PublicEvent': return { ...base, text: `open-sourced ${name}` };
    case 'DeleteEvent': return null;
    default: return { ...base, text: `was active in ${name}` };
  }
}

type Handlers = {
  /** Most recent activity when the page loads. */
  initial: (a: Activity, at: string) => void;
  /** Each new event after load, oldest first. */
  fresh: (a: Activity, at: string) => void;
  status: (ok: boolean) => void;
};

export function startLiveFeed(repos: Record<string, { name: string }>, on: Handlers) {
  // Event IDs are not ordered across event types, and GitHub sometimes delivers
  // events late, so order by timestamp and remember which IDs were shown.
  const seen = new Set<string>();
  let first = true;
  let stopped = false;
  let timer = 0;

  async function poll() {
    if (stopped || document.hidden) return;
    try {
      const res = await fetch(URL_, { cache: 'no-cache', headers: { Accept: 'application/vnd.github+json' } });
      if (!res.ok) throw new Error(String(res.status));
      const events = ((await res.json()) as GhEvent[])
        .map((e) => ({ e, a: describe(e, repos) }))
        .filter((x): x is { e: GhEvent; a: Activity } => x.a !== null)
        .sort((x, y) => y.e.created_at.localeCompare(x.e.created_at));
      on.status(true);
      if (!events.length) return;
      if (first) {
        first = false;
        on.initial(events[0].a, events[0].e.created_at);
      } else {
        // Only animate events that are actually recent; late arrivals just get recorded.
        const recent = Date.now() - 10 * 60e3;
        events.filter((x) => !seen.has(x.e.id) && Date.parse(x.e.created_at) > recent).reverse().slice(-3)
          .forEach((x, i) => setTimeout(() => !stopped && on.fresh(x.a, x.e.created_at), i * 1100));
      }
      events.forEach((x) => seen.add(x.e.id));
    } catch {
      on.status(false);
    }
  }

  const schedule = () => { timer = window.setTimeout(async () => { await poll(); if (!stopped) schedule(); }, 60e3); };
  const onVisible = () => { if (!document.hidden) poll(); };
  document.addEventListener('visibilitychange', onVisible);
  poll();
  schedule();
  return () => { stopped = true; clearTimeout(timer); document.removeEventListener('visibilitychange', onVisible); };
}

export const presenceText = (a: Activity, at: string) =>
  Date.now() - Date.parse(at) < 15 * 60e3 ? { active: true, html: `<span class="now">active now</span> · ${escapeHtml(a.text)}` } : { active: false, html: `last seen ${escapeHtml(a.text)} · ${ago(at)}` };

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
