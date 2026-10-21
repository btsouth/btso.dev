// /stats: rolling numbers, hover readouts and the model toggles.
import { modelColor, short, money, dayLabel } from '../lib/ai';

type Day = { d: string; t: number; v: number; c: number; m: Record<string, number> };
type Model = { name: string; tokens: number; tokens30: number; value: number; value30: number };
const data = JSON.parse(document.getElementById('usageData')?.textContent ?? '{}') as {
  days: Day[]; models: Model[];
};
const byDay = new Map(data.days.map((d) => [d.d, d]));
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Numbers roll up when they scroll into view, in their own format.
const formats: Record<string, (n: number) => string> = {
  short, money, int: (n) => String(Math.round(n)), pct: (n) => `${n.toFixed(1)}%`,
};
const io = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    io.unobserve(e.target);
    const el = e.target as HTMLElement;
    const to = Number(el.dataset.num);
    const fmt = formats[el.dataset.fmt ?? 'int'];
    if (reduced) { el.textContent = fmt(to); continue; }
    const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / 1400);
      el.textContent = fmt(to * (1 - Math.pow(1 - k, 4)));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
});
document.querySelectorAll<HTMLElement>('[data-num]').forEach((el) => io.observe(el));

/** Show a panel's tooltip above el, kept inside the panel. */
function tipAt(tip: HTMLElement, el: Element, html: string) {
  const box = tip.parentElement!.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  tip.innerHTML = html;
  tip.classList.add('show');
  const half = tip.offsetWidth / 2 + 8;
  const x = Math.min(Math.max(r.left + r.width / 2 - box.left, half), box.width - half);
  tip.style.left = `${x}px`;
  tip.style.top = `${r.top - box.top}px`;
}
const hideOn = (area: Element | null, tip: HTMLElement | null) =>
  area?.addEventListener('pointerleave', () => tip?.classList.remove('show'));

const breakdown = (d: Day) =>
  Object.entries(d.m)
    .sort((a, b) => (a[0] === 'Other' ? 1 : b[0] === 'Other' ? -1 : b[1] - a[1]))
    .map(([n, t]) => `<br><span class="sw" style="background:${n === 'Other' ? 'var(--fg3)' : modelColor(n)}"></span>${n} <b>${short(t)}</b>`)
    .join('');

// Calendar
const cal = document.getElementById('cal');
const calTip = document.getElementById('calTip');
cal?.addEventListener('pointerover', (e) => {
  const cell = (e.target as Element).closest<HTMLElement>('i[data-d]:not(.pad)');
  if (!cell || !calTip) return;
  const d = byDay.get(cell.dataset.d!);
  const date = dayLabel(cell.dataset.d!, { weekday: 'short', month: 'short', day: 'numeric' });
  tipAt(calTip, cell, d && d.t
    ? `<b>${date}</b><br>${short(d.t)} tokens · <span class="r">${money(d.v)}</span>${breakdown(d)}`
    : `<b>${date}</b><br><span class="hint">no AI coding</span>`);
});
hideOn(cal, calTip);
// On narrow screens the calendar scrolls; start at today.
const calScroll = document.getElementById('calScroll');
if (calScroll) calScroll.scrollLeft = calScroll.scrollWidth;

// Day-by-day bars
const daily = document.getElementById('daily');
const dailyTip = document.getElementById('dailyTip');
daily?.addEventListener('pointerover', (e) => {
  const col = (e.target as Element).closest<HTMLElement>('.col');
  const d = col && byDay.get(col.dataset.d!);
  if (!col || !d || !dailyTip) return;
  tipAt(dailyTip, col, `<b>${dayLabel(d.d, { weekday: 'short', month: 'short', day: 'numeric' })}</b><br>${short(d.t)} tokens · <span class="r">${money(d.v)}</span>${breakdown(d)}`);
});
hideOn(daily, dailyTip);

// Model bars: range and measure toggles.
const panel = document.getElementById('modelPanel');
const bars = document.getElementById('mbars');
let range = '30';
let metric = 'tokens';
function drawBars() {
  if (!bars) return;
  const key = (metric === 'tokens' ? 'tokens' : 'value') + (range === '30' ? '30' : '') as keyof Model;
  const other = (metric === 'tokens' ? 'value' : 'tokens') + (range === '30' ? '30' : '') as keyof Model;
  const list = data.models.filter((m) => (m[key] as number) > 0).sort((a, b) => (b[key] as number) - (a[key] as number)).slice(0, 8);
  const max = (list[0]?.[key] as number) || 1;
  const show = (m: Model, k: keyof Model) => (String(k).startsWith('value') ? money(m[k] as number) : short(m[k] as number));
  bars.innerHTML = list.map((m) => `
    <div class="mbar" style="--pc:${modelColor(m.name)};--w:0%" data-w="${((m[key] as number) / max) * 100}">
      <span class="nm"><i></i><span>${m.name}</span></span>
      <span class="track"><span class="fill" style="display:block"></span></span>
      <span class="val">${show(m, key)}<small>${show(m, other)}</small></span>
    </div>`).join('');
  requestAnimationFrame(() => requestAnimationFrame(() => {
    bars.querySelectorAll<HTMLElement>('.mbar').forEach((row) => row.style.setProperty('--w', `${row.dataset.w}%`));
  }));
}
panel?.addEventListener('click', (e) => {
  const chip = (e.target as Element).closest<HTMLElement>('.chip');
  if (!chip) return;
  const group = chip.dataset.range ? 'range' : 'metric';
  panel.querySelectorAll<HTMLElement>(`[data-${group}]`).forEach((c) => c.classList.toggle('on', c === chip));
  if (chip.dataset.range) range = chip.dataset.range;
  if (chip.dataset.metric) metric = chip.dataset.metric;
  drawBars();
});
// Grow the bars in when the panel first shows.
if (panel && bars) {
  bars.querySelectorAll<HTMLElement>('.mbar').forEach((row) => { row.dataset.w = row.style.getPropertyValue('--w').replace('%', ''); row.style.setProperty('--w', '0%'); });
  const once = new IntersectionObserver(([e]) => {
    if (!e.isIntersecting) return;
    once.disconnect();
    bars.querySelectorAll<HTMLElement>('.mbar').forEach((row) => row.style.setProperty('--w', `${row.dataset.w}%`));
  }, { rootMargin: '0px 0px -10% 0px' });
  once.observe(panel);
}
