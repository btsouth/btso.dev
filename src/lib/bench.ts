// /bench data: the model-canary summary shaped for the page. Older summaries without
// labels, vendors or lifecycle fields still render: labels come from ai.ts and the
// vendor is guessed from the model id. Used by the page and its chart script.
import { modelColor, modelLabel, median } from './ai';

export type Limits = { five_hour?: number | null; seven_day?: number | null; monthly?: number | null } | null;
export type Review = { cause: string; checked?: string; note: string };
export type Run = {
  date: string; passed: boolean; score: number; wall_seconds: number; over_limit?: boolean;
  limits?: { before: Limits; after: Limits }; api_cost_usd?: number | null; tokens?: number; output?: number;
  review?: Review; harness_version?: string; plan?: string;
};
type Latest = Omit<Run, 'tokens'> & { hidden_passed: number; hidden_total: number; tokens: Record<string, number> };
type RawModel = {
  model: string; plan: string; effort?: string; runs: number; latest: Latest; history: Run[];
  label?: string; vendor?: string; family?: string; base?: string | null; successor?: string | null;
  retired?: string | null; until?: string | null; first?: string; last?: string;
};
export type RawBench = {
  schema?: number; updated?: string; date?: string; hidden_total?: number; task_version?: number;
  variant?: Record<string, any>; events?: { date: string; vendor: string; kind?: string; text: string }[];
  models: Record<string, RawModel>;
};

export type Group = 'Anthropic' | 'OpenAI' | 'Other';
export const GROUPS: Group[] = ['Anthropic', 'OpenAI', 'Other'];
export type Line = 'solid' | 'dashed' | 'dotted';
export type Model = {
  key: string; model: string; label: string; name: string; vendor: string; group: Group; family: string;
  base: string | null; successor: string | null; predecessor: string | null; retired: string | null; until: string | null;
  first: string; last: string; plan: string; effort: string; latest: Latest; history: Run[]; color: string; line: Line;
};
export type BenchEvent = { date: string; group: Group; text: string };
export type Bench = {
  date: string; hidden_total: number; variant: Record<string, any>;
  models: Model[]; active: Model[]; retired: Model[]; axis: string[]; events: BenchEvent[];
};

const plainEffort = (e?: string) => !e || e === 'medium' || e === 'default';
/** A model run at a second effort level is its own entry, named for it: "Haiku 5.5 high". */
export const displayName = (label: string, effort?: string) => label + (plainEffort(effort) ? '' : ` ${effort}`);

export function guessVendor(id: string) {
  if (/^claude|anthropic/i.test(id)) return 'Anthropic';
  if (/^(gpt|o\d|codex)|openai/i.test(id)) return 'OpenAI';
  if (/deepseek/i.test(id)) return 'DeepSeek';
  return 'Other';
}
export const groupOf = (vendor: string): Group => (vendor === 'Anthropic' || vendor === 'OpenAI' ? vendor : 'Other');

const DAY = 864e5;
const toDay = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / DAY);
const fromDay = (n: number) => new Date(n * DAY).toISOString().slice(0, 10);
/** Whole days from a to b. */
export const daysBetween = (a: string, b: string) => toDay(b) - toDay(a);
/** Every date from first to last, so a day without runs is a gap rather than missing. */
export function dayRange(first: string, last: string) {
  const out: string[] = [];
  for (let d = toDay(first); d <= toDay(last); d++) out.push(fromDay(d));
  return out;
}

export function normalize(raw: RawBench): Bench {
  const entries = Object.entries(raw.models ?? {}).filter(([, m]) => m.history?.length);
  const keys = new Set(entries.map(([k]) => k));
  const models = entries.map(([key, m]): Model => {
    const history = [...m.history].sort((a, b) => a.date.localeCompare(b.date));
    const label = m.label ?? modelLabel(m.model);
    const effort = m.effort ?? 'medium';
    const vendor = m.vendor ?? guessVendor(m.model);
    // Older summaries don't say which entry is an effort variant: it's the one sharing a
    // model id with a medium entry.
    let base = m.base ?? null;
    if (m.base === undefined && !plainEffort(effort)) base = entries.find(([k, o]) => k !== key && o.model === m.model && plainEffort(o.effort))?.[0] ?? null;
    if (base && !keys.has(base)) base = null;
    const successor = m.successor && keys.has(m.successor) ? m.successor : null;
    const name = displayName(label, effort);
    return {
      key, model: m.model, label, name, vendor, group: groupOf(vendor), family: m.family ?? label.split(' ')[0].toLowerCase(),
      base, successor, predecessor: null, retired: m.retired ?? null, until: m.until ?? null,
      first: m.first ?? history[0].date, last: m.last ?? history.at(-1)!.date, plan: m.plan, effort, latest: m.latest, history,
      color: modelColor(name), line: base ? 'dotted' : m.successor ? 'dashed' : 'solid',
    };
  });
  const byKey = new Map(models.map((m) => [m.key, m]));
  for (const m of models) if (m.successor) byKey.get(m.successor)!.predecessor ??= m.key;

  // Vendor by vendor, each model followed by its effort variants and then its predecessor.
  const ordered: Model[] = [];
  const seen = new Set<string>();
  const place = (m: Model) => {
    if (seen.has(m.key)) return;
    seen.add(m.key);
    ordered.push(m);
    models.filter((o) => o.base === m.key).forEach(place);
    models.filter((o) => o.successor === m.key).forEach(place);
  };
  for (const g of GROUPS) {
    const mine = models.filter((m) => m.group === g);
    mine.filter((m) => !m.base && !m.successor).forEach(place);
    mine.forEach(place);
  }

  const lastRun = models.map((m) => m.last).sort().at(-1);
  const date = raw.date ?? lastRun ?? '';
  const first = models.map((m) => m.first).sort()[0];
  const axis = first ? dayRange(first, date > lastRun! ? date : lastRun!) : [];
  return {
    date, hidden_total: raw.hidden_total ?? 157, variant: raw.variant ?? {},
    models: ordered, active: ordered.filter((m) => !m.retired), retired: ordered.filter((m) => m.retired), axis,
    events: (raw.events ?? []).map((e) => ({ date: e.date, group: groupOf(e.vendor), text: e.text })),
  };
}

/** A pass rate that never rounds a miss away: 99.4% shows as 99%, not 100%. */
export function passPct(passed: number, runs: number) {
  const pct = (passed / runs) * 100;
  return passed < runs ? Math.min(99, Math.round(pct)) : 100;
}

const nums = (xs: (number | null | undefined)[]) => xs.filter((x): x is number => x != null && Number.isFinite(x));
const med = (xs: (number | null | undefined)[]) => { const v = nums(xs); return v.length ? median(v) : null; };

/** Lifetime numbers for one model, medians over every counted run. */
export function lifetime(m: Model) {
  const h = m.history;
  const passed = h.filter((r) => r.passed).length;
  return {
    runs: h.length, passed, pass: passPct(passed, h.length),
    time: med(h.map((r) => r.wall_seconds)), tokens: med(h.map((r) => r.tokens)), price: med(h.map((r) => r.api_cost_usd)),
  };
}

export const PAIRED_MIN = 5;
/**
 * A model against its predecessor on the days both ran the same task: the ratio of the
 * two medians over those days, minus one. n is the number of shared days; with fewer
 * than PAIRED_MIN there's no comparison.
 */
export function paired(m: Model, prev: Model) {
  const theirs = new Map(prev.history.map((r) => [r.date, r]));
  const pairs = m.history.filter((r) => theirs.has(r.date)).map((r) => [r, theirs.get(r.date)!] as const);
  const change = (pick: (r: Run) => number | null | undefined) => {
    const both = pairs.filter(([a, b]) => pick(a) != null && pick(b) != null);
    if (both.length < PAIRED_MIN) return null;
    const a = median(both.map(([r]) => pick(r)!));
    const b = median(both.map(([, r]) => pick(r)!));
    return b ? a / b - 1 : null;
  };
  const n = pairs.length;
  if (n < PAIRED_MIN) return { n };
  return {
    n, time: change((r) => r.wall_seconds), tokens: change((r) => r.tokens), price: change((r) => r.api_cost_usd),
    passed: pairs.filter(([a]) => a.passed).length, prevPassed: pairs.filter(([, b]) => b.passed).length,
  };
}

/**
 * Weekly medians of daily points, in 7-day buckets that end on the last day of the axis,
 * each placed on its bucket's last day. Weeks without a run are left out (a gap).
 */
export function weekly(pts: { i: number; v: number }[], end: number) {
  const buckets = new Map<number, number[]>();
  for (const p of pts) {
    const b = Math.floor((end - p.i) / 7);
    buckets.set(b, [...(buckets.get(b) ?? []), p.v]);
  }
  return [...buckets].map(([b, vs]) => ({ i: end - b * 7, v: median(vs) })).sort((a, b) => a.i - b.i);
}

/** "+12%" / "−8%", with a real minus sign. */
export const pctChange = (x: number) => `${x > 0 ? '+' : x < 0 ? '−' : '±'}${Math.abs(Math.round(x * 100))}%`;
