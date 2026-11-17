// /bench: the trend charts (one per vendor, sharing the measure, range and retired
// switches; hover readout; pick-a-model legend) and the stale-data notice.
import { short, money, secs, dayLabel } from '../lib/ai';
import { dayRange, weekly, daysBetween } from '../lib/bench';

type Metric = 's' | 't' | 'p' | 'q';
type M = { k: string; n: string; c: string; l: string; g: string; r: 0 | 1; d: number[]; f: (0 | 1)[] } & Record<Metric, (number | null)[]>;
const data = JSON.parse(document.getElementById('benchData')?.textContent ?? '{"models":[]}') as {
  start?: string; days?: number; events?: { i: number; g: string; t: string }[]; models: M[];
};

// If the morning run didn't happen, say so instead of showing the live dot.
const eyebrow = document.getElementById('benchEyebrow');
const last = eyebrow?.dataset.date;
if (eyebrow && last) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  if (daysBetween(last, today) > 1) {
    eyebrow.classList.add('stale');
    eyebrow.querySelector('.t')!.textContent = `No run since ${dayLabel(last, { weekday: 'short', month: 'short', day: 'numeric' })}`;
  }
}

const panel = document.getElementById('trendPanel');
const tip = document.getElementById('trendTip');
const note = document.getElementById('rangeNote');
const axis = data.start && data.days ? dayRange(data.start, addDays(data.start, data.days - 1)) : [];
const END = axis.length - 1;
let metric: Metric = 's';
let range: '30' | '90' | 'all' = '30';
let showRetired = false;
let focus: string | null = null;

function addDays(iso: string, n: number) {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
}

const fmt: Record<Metric, (n: number) => string> = {
  s: secs, t: short, p: money, q: (n) => `${Math.round(n * 100)}%`,
};
const NS = 'http://www.w3.org/2000/svg';
const el = (tag: string, attrs: Record<string, string | number>) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, val] of Object.entries(attrs)) e.setAttribute(k, String(val));
  return e;
};

/** A round tick step and the top of the scale: at most five steps, in whole minutes for longer times. */
function niceScale(v: number) {
  if (v <= 0) return { step: 1, max: 1 };
  const unit = metric === 's' && v > 120 ? 60 : 1;
  const u = v / unit;
  const p = 10 ** Math.floor(Math.log10(u / 5));
  const step = (unit > 1 ? [1, 2, 5, 10] : [1, 2, 2.5, 5, 10]).map((m) => m * p).find((m) => u / m <= 5)! * unit;
  return { step, max: Math.ceil(v / step - 1e-9) * step };
}

const daily = () => range === '30';
const lo = () => Math.max(0, END - (range === '30' ? 29 : range === '90' ? 89 : END));

/** One model's points for the current measure and range: daily values, or weekly medians. */
function points(m: M) {
  const from = lo();
  const pts = m.d.map((i, k) => ({ i, v: m[metric][k] })).filter((p): p is { i: number; v: number } => p.i >= from && p.v != null);
  return daily() ? pts : weekly(pts, END);
}

type Geom = { left: number; step: number; from: number; to: number; w: number };
const geoms = new WeakMap<HTMLElement, Geom>();

function draw(box: HTMLElement) {
  const chart = box.querySelector<HTMLElement>('.chart')!;
  const group = box.dataset.group!;
  const w = chart.clientWidth;
  const h = chart.clientHeight;
  const pad = { l: 50, r: 10, t: 10, b: 24 };
  const from = lo();
  const to = END;
  const series = data.models
    .filter((m) => m.g === group && (showRetired || !m.r))
    .map((m) => ({ m, pts: points(m) }))
    .filter((s) => s.pts.length);
  chart.innerHTML = '';
  chart.classList.toggle('focus', !!focus && series.some((s) => s.m.k === focus));
  if (!series.length) {
    chart.innerHTML = '<div class="empty">No runs in this range.</div>';
    return;
  }
  // A picked model gets the whole scale, so a slow model doesn't flatten a fast one.
  const scaled = series.filter((s) => s.m.k === focus);
  const values = (scaled.length ? scaled : series).flatMap((s) => s.pts.map((p) => p.v));
  const scale = metric === 'q' ? { step: 0, max: 1 } : niceScale(Math.max(...values) * 1.05);
  const max = scale.max;
  const min = metric === 'q' ? Math.min(0.8, ...values) : 0;
  const ticks = metric === 'q' ? [0, 1, 2, 3, 4].map((k) => min + ((max - min) * k) / 4) : [...Array(Math.round(max / scale.step) + 1)].map((_, k) => k * scale.step);
  const span = Math.max(1, to - from);
  const x = (i: number) => pad.l + ((i - from) / span) * (w - pad.l - pad.r);
  const y = (val: number) => pad.t + (1 - (val - min) / (max - min || 1)) * (h - pad.t - pad.b);
  geoms.set(box, { left: pad.l, step: (w - pad.l - pad.r) / span, from, to, w });

  const svg = el('svg', { viewBox: `0 0 ${w} ${h}`, role: 'img', 'aria-label': `${group} trend per model` });
  const grid = el('g', { class: 'grid' });
  for (const val of ticks) {
    grid.append(el('line', { x1: pad.l, x2: w - pad.r, y1: y(val), y2: y(val) }));
    const label = el('text', { x: pad.l - 7, y: y(val) + 3, 'text-anchor': 'end' });
    label.textContent = metric === 's' && val >= 60 && val % 60 === 0 ? `${val / 60}m` : fmt[metric](val);
    grid.append(label);
  }
  for (const i of new Set([from, Math.round((from + to) / 2), to])) {
    const label = el('text', { x: x(i), y: h - 6, 'text-anchor': i === from ? 'start' : i === to ? 'end' : 'middle' });
    label.textContent = dayLabel(axis[i]);
    grid.append(label);
  }
  svg.append(grid);
  // Harness and plan changes: a faint tick, explained in the hover readout.
  const evs = el('g', { class: 'ev' });
  for (const e of data.events ?? []) {
    if (e.g !== group || e.i < from || e.i > to) continue;
    evs.append(el('line', { x1: x(e.i), x2: x(e.i), y1: pad.t, y2: h - pad.b }));
    evs.append(el('rect', { x: x(e.i) - 2.5, y: pad.t - 5, width: 5, height: 5, rx: 1 }));
  }
  svg.append(evs);
  const clipId = `plot-${group}`;
  const clip = el('clipPath', { id: clipId });
  clip.append(el('rect', { x: 0, y: pad.t - 6, width: w, height: h - pad.t - pad.b + 12 }));
  svg.append(clip);
  svg.append(el('line', { class: 'cross', x1: 0, x2: 0, y1: pad.t, y2: h - pad.b }));
  // Lines break where a day (or a week, for medians) has no run.
  const gap = daily() ? 1 : 7;
  for (const { m, pts } of series) {
    const g = el('g', { style: `--pc:${m.c}`, 'clip-path': `url(#${clipId})` });
    const on = focus === m.k ? ' on' : '';
    let d = '';
    pts.forEach((p, k) => { d += `${k && p.i - pts[k - 1].i <= gap ? 'L' : 'M'}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`; });
    g.append(el('path', { class: `ln ${m.l}${on}`, d }));
    pts.forEach((p, k) => {
      const alone = (k === 0 || p.i - pts[k - 1].i > gap) && (k === pts.length - 1 || pts[k + 1].i - p.i > gap);
      if (daily() || alone) g.append(el('circle', { class: `pt${on}`, cx: x(p.i), cy: y(p.v), r: daily() ? 2.5 : 2 }));
    });
    svg.append(g);
  }
  chart.append(svg);
}

const boxes = () => [...(panel?.querySelectorAll<HTMLElement>('.vchart') ?? [])];
function drawAll() {
  for (const box of boxes()) {
    box.hidden = !showRetired && box.dataset.retiredOnly === '1';
    box.querySelectorAll<HTMLElement>('.legend button').forEach((b) => {
      const m = data.models.find((x) => x.k === b.dataset.key);
      b.hidden = !showRetired && !!m?.r;
      b.classList.toggle('on', b.dataset.key === focus);
    });
    if (!box.hidden) draw(box);
  }
  if (note) note.textContent = daily()
    ? 'Daily runs over the last 30 days. Gaps are days without a run.'
    : `Weekly medians ${range === '90' ? 'over the last 90 days' : 'since the first run'}, each ending on the day shown. Gaps are weeks without a run.`;
}

function hover(box: HTMLElement, e: PointerEvent) {
  const g = geoms.get(box);
  const chart = box.querySelector<HTMLElement>('.chart')!;
  if (!g || !tip || !panel) return;
  const r = chart.getBoundingClientRect();
  let i = g.from + Math.round((e.clientX - r.left - g.left) / g.step);
  if (!daily()) i = END - Math.round((END - i) / 7) * 7;
  if (i < g.from || i > g.to) return hide(box);
  const bucket = daily() ? [i] : [...Array(7)].map((_, k) => i - k);
  const rows = data.models
    .filter((m) => m.g === box.dataset.group && (showRetired || !m.r))
    .map((m) => ({ m, p: points(m).find((p) => p.i === i), missed: daily() && m.d.some((d, k) => d === i && !m.f[k]) }))
    .filter((x) => x.p)
    .sort((a, b) => b.p!.v - a.p!.v);
  const evs = (data.events ?? []).filter((ev) => ev.g === box.dataset.group && bucket.includes(ev.i));
  const cx = g.left + (i - g.from) * g.step;
  const cross = chart.querySelector('.cross');
  cross?.setAttribute('x1', String(cx));
  cross?.setAttribute('x2', String(cx));
  chart.classList.add('hover');
  const head = daily() ? dayLabel(axis[i], { weekday: 'short', month: 'short', day: 'numeric' }) : `Week to ${dayLabel(axis[i])}, median`;
  tip.innerHTML = `<b>${head}</b>` +
    (rows.length ? '' : '<br><span class="r0">No run</span>') +
    rows.map(({ m, p, missed }) => `<br><span class="sw" style="background:${m.c}"></span>${m.n} <b>${fmt[metric](p!.v)}</b>${missed ? ' <span class="r">missed tests</span>' : ''}`).join('') +
    evs.map((ev) => `<br><span class="evt">${dayLabel(axis[ev.i])}: ${ev.t}</span>`).join('');
  tip.classList.add('show');
  const pb = panel.getBoundingClientRect();
  const half = tip.offsetWidth / 2 + 8;
  tip.style.left = `${Math.min(Math.max(r.left - pb.left + cx, half), pb.width - half)}px`;
  tip.style.top = `${r.top - pb.top + 12}px`;
  tip.classList.add('below');
}
function hide(box: HTMLElement) {
  tip?.classList.remove('show');
  box.querySelector('.chart')?.classList.remove('hover');
}

for (const box of boxes()) {
  const chart = box.querySelector<HTMLElement>('.chart')!;
  chart.addEventListener('pointermove', (e) => hover(box, e));
  chart.addEventListener('pointerleave', () => hide(box));
}

panel?.addEventListener('click', (e) => {
  const t = e.target as Element;
  const chip = t.closest<HTMLElement>('.chip[data-metric]');
  const rng = t.closest<HTMLElement>('.chip[data-range]');
  const key = t.closest<HTMLElement>('.legend button[data-key]');
  if (chip) {
    panel.querySelectorAll('.chip[data-metric]').forEach((c) => c.classList.toggle('on', c === chip));
    metric = chip.dataset.metric as Metric;
  } else if (rng) {
    panel.querySelectorAll('.chip[data-range]').forEach((c) => c.classList.toggle('on', c === rng));
    range = rng.dataset.range as typeof range;
  } else if (t.closest('#showRetired')) {
    showRetired = !showRetired;
    const btn = panel.querySelector('#showRetired')!;
    btn.classList.toggle('on', showRetired);
    btn.setAttribute('aria-pressed', String(showRetired));
    if (!showRetired && data.models.find((m) => m.k === focus)?.r) focus = null;
  } else if (key) {
    focus = focus === key.dataset.key ? null : key.dataset.key!;
  } else return;
  drawAll();
});

if (axis.length) {
  drawAll();
  let width = 0;
  new ResizeObserver(() => {
    if (panel && panel.clientWidth !== width) { width = panel.clientWidth; drawAll(); }
  }).observe(panel ?? document.body);
}
