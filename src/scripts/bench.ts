// /bench: the trend chart (measure switch, hover readout, pick-a-model legend).
import { modelColor, short, money, secs, dayLabel } from '../lib/ai';

type Run = { date: string; wall_seconds: number; tokens?: number; api_cost_usd?: number | null; score: number; passed: boolean };
const data = JSON.parse(document.getElementById('benchData')?.textContent ?? '{"models":[]}') as {
  models: { key: string; name: string; history: Run[] }[];
};

const chart = document.getElementById('trend');
const panel = document.getElementById('trendPanel');
const tip = document.getElementById('trendTip');
const legend = document.getElementById('trendLegend');
let metric: keyof Run = 'wall_seconds';
let focus: string | null = null;

const fmt: Partial<Record<keyof Run, (n: number) => string>> = {
  wall_seconds: secs, tokens: short, api_cost_usd: money, score: (n) => `${Math.round(n * 100)}%`,
};
const dates = [...new Set(data.models.flatMap((m) => m.history.map((r) => r.date)))].sort().slice(-30);
const NS = 'http://www.w3.org/2000/svg';
const el = (tag: string, attrs: Record<string, string | number>) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, val] of Object.entries(attrs)) e.setAttribute(k, String(val));
  return e;
};

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((m) => m >= v)!;
}

let geom = { left: 0, step: 0 };

function draw() {
  if (!chart) return;
  const w = chart.clientWidth;
  const h = chart.clientHeight;
  const pad = { l: 56, r: 12, t: 12, b: 26 };
  const series = data.models.map((m) => ({
    ...m, pts: m.history.filter((r) => dates.includes(r.date) && r[metric] != null).map((r) => ({ i: dates.indexOf(r.date), v: Number(r[metric]) })),
  })).filter((s) => s.pts.length);
  chart.innerHTML = '';
  if (!series.length) {
    chart.innerHTML = '<div class="empty">No data for this measure yet.</div>';
    return;
  }
  // A picked model gets the whole scale, so a slow model doesn't flatten a fast one.
  const scaled = series.filter((s) => !focus || s.key === focus);
  const values = (scaled.length ? scaled : series).flatMap((s) => s.pts.map((p) => p.v));
  const max = metric === 'score' ? 1 : niceMax(Math.max(...values) * 1.08);
  const min = metric === 'score' ? Math.min(0.8, ...values) : 0;
  const span = Math.max(1, dates.length - 1);
  const x = (i: number) => (dates.length === 1 ? (pad.l + w - pad.r) / 2 : pad.l + (i / span) * (w - pad.l - pad.r));
  const y = (val: number) => pad.t + (1 - (val - min) / (max - min || 1)) * (h - pad.t - pad.b);
  geom = { left: pad.l, step: dates.length === 1 ? 0 : (w - pad.l - pad.r) / span };

  const svg = el('svg', { viewBox: `0 0 ${w} ${h}`, role: 'img', 'aria-label': 'Trend per model' });
  const grid = el('g', { class: 'grid' });
  for (let k = 0; k <= 4; k++) {
    const val = min + ((max - min) * k) / 4;
    grid.append(el('line', { x1: pad.l, x2: w - pad.r, y1: y(val), y2: y(val) }));
    const label = el('text', { x: pad.l - 8, y: y(val) + 3, 'text-anchor': 'end' });
    label.textContent = fmt[metric]!(val);
    grid.append(label);
  }
  const ticks = dates.length === 1 ? [0] : [0, Math.floor(span / 2), span];
  for (const i of new Set(ticks)) {
    const label = el('text', { x: x(i), y: h - 6, 'text-anchor': dates.length === 1 ? 'middle' : i === 0 ? 'start' : i === span ? 'end' : 'middle' });
    label.textContent = dayLabel(dates[i]);
    grid.append(label);
  }
  svg.append(grid);
  const clip = el('clipPath', { id: 'plot' });
  clip.append(el('rect', { x: 0, y: pad.t - 6, width: w, height: h - pad.t - pad.b + 12 }));
  svg.append(clip);
  svg.append(el('line', { class: 'cross', id: 'cross', x1: 0, x2: 0, y1: pad.t, y2: h - pad.b }));
  for (const s of series) {
    const g = el('g', { style: `--pc:${modelColor(s.name)}`, 'clip-path': 'url(#plot)' });
    const on = focus === s.key ? ' on' : '';
    if (s.pts.length > 1) g.append(el('path', { class: `ln${on}`, d: s.pts.map((p, k) => `${k ? 'L' : 'M'}${x(p.i)},${y(p.v)}`).join('') }));
    for (const p of s.pts) g.append(el('circle', { class: `pt${on}`, cx: x(p.i), cy: y(p.v), r: dates.length > 20 ? 2.5 : 4 }));
    svg.append(g);
  }
  chart.append(svg);
  chart.classList.toggle('focus', !!focus);
}

function hover(e: PointerEvent) {
  if (!chart || !tip) return;
  const r = chart.getBoundingClientRect();
  const i = geom.step ? Math.round((e.clientX - r.left - geom.left) / geom.step) : 0;
  if (i < 0 || i >= dates.length) return;
  const d = dates[i];
  const rows = data.models
    .map((m) => ({ m, run: m.history.find((h) => h.date === d) }))
    .filter((x) => x.run && x.run[metric] != null)
    .sort((a, b) => Number(b.run![metric]) - Number(a.run![metric]));
  if (!rows.length) return;
  const cx = geom.step ? geom.left + i * geom.step : r.width / 2;
  const cross = document.getElementById('cross');
  cross?.setAttribute('x1', String(cx));
  cross?.setAttribute('x2', String(cx));
  chart.classList.add('hover');
  tip.innerHTML = `<b>${dayLabel(d, { weekday: 'short', month: 'short', day: 'numeric' })}</b>` + rows.map(({ m, run }) =>
    `<br><span class="sw" style="background:${modelColor(m.name)}"></span>${m.name} <b>${fmt[metric]!(Number(run![metric]))}</b>${run!.passed ? '' : ' <span class="r">missed tests</span>'}`).join('');
  tip.classList.add('show');
  const box = tip.parentElement!.getBoundingClientRect();
  const half = tip.offsetWidth / 2 + 8;
  tip.style.left = `${Math.min(Math.max(r.left - box.left + cx, half), box.width - half)}px`;
  tip.style.top = `${r.top - box.top + 12}px`;
  tip.classList.add('below');
}

chart?.addEventListener('pointermove', hover);
chart?.addEventListener('pointerleave', () => { tip?.classList.remove('show'); chart.classList.remove('hover'); });

panel?.addEventListener('click', (e) => {
  const chip = (e.target as Element).closest<HTMLElement>('.chip[data-metric]');
  if (!chip) return;
  panel.querySelectorAll('.chip[data-metric]').forEach((c) => c.classList.toggle('on', c === chip));
  metric = chip.dataset.metric as keyof Run;
  draw();
});

legend?.addEventListener('click', (e) => {
  const btn = (e.target as Element).closest<HTMLElement>('button[data-key]');
  if (!btn) return;
  focus = focus === btn.dataset.key ? null : btn.dataset.key!;
  legend.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.key === focus));
  draw();
});

draw();
new ResizeObserver(() => draw()).observe(chart ?? document.body);
