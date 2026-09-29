// Small shared behaviors: scroll reveal, count-up numbers, card glow, copy
// buttons, header border, and the "new since your last visit" badge.
import { ago } from '../lib/time';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fmt = (n: number) => n.toLocaleString('en-US');

export const SEEN_KEY = 'btso-seen';
/** Last time this visitor marked the ship log read. First visits count the last 30 hours as new. */
export function lastSeen() {
  try { return Number(localStorage.getItem(SEEN_KEY)) || Date.now() - 30 * 3600e3; } catch { return Date.now() - 30 * 3600e3; }
}

export function countUp(el: HTMLElement, to = Number(el.dataset.count)) {
  if (reduced) { el.textContent = fmt(to); return; }
  const t0 = performance.now();
  const step = (t: number) => {
    const k = Math.min(1, (t - t0) / 1400);
    el.textContent = fmt(Math.round(to * (1 - Math.pow(1 - k, 4))));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

const io = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    const el = e.target as HTMLElement;
    io.unobserve(el);
    el.classList.add('in');
    if (el.dataset.count && !('countManual' in el.dataset)) countUp(el);
    if (el.classList.contains('odo-wrap')) el.classList.add('odo-go');
    el.dispatchEvent(new CustomEvent('reveal'));
  }
}, { rootMargin: '0px 0px -8% 0px' });

export function observe(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>('.rv:not(.in), [data-count], .odo-wrap, [data-reveal]').forEach((el) => io.observe(el));
}
observe();

document.addEventListener('pointermove', (e) => {
  const g = (e.target as Element).closest?.<HTMLElement>('.glow');
  if (!g) return;
  const r = g.getBoundingClientRect();
  g.style.setProperty('--mx', `${e.clientX - r.left}px`);
  g.style.setProperty('--my', `${e.clientY - r.top}px`);
});

document.addEventListener('click', (e) => {
  const c = (e.target as Element).closest?.<HTMLElement>('[data-copy]');
  if (!c) return;
  navigator.clipboard?.writeText(c.dataset.copy ?? '');
  const label = c.querySelector('.c');
  if (label) { label.textContent = 'copied'; setTimeout(() => (label.textContent = 'copy'), 1200); }
});

// Long release notes are clamped until expanded. Clicking anywhere on a clamped
// entry opens it; only the button closes it again, so text stays selectable.
document.addEventListener('click', (e) => {
  const target = e.target as Element;
  const btn = target.closest?.<HTMLElement>('[data-expand]');
  const entry = (btn ?? target.closest?.('.entry'))?.closest('.entry');
  const md = entry?.querySelector('.md');
  if (!entry || !md) return;
  if (!btn) {
    if (!md.classList.contains('clamp') || target.closest('a, button') || String(getSelection()).trim()) return;
  }
  const open = md.classList.toggle('clamp') === false;
  const toggle = entry.querySelector<HTMLElement>('[data-expand]');
  if (toggle) { toggle.textContent = open ? 'Show less' : 'Read more'; toggle.setAttribute('aria-expanded', String(open)); }
});

// A hello for anyone who opens the console.
console.log(
  '%cbtso.dev%c\npress T to flip themes. on the homepage: click the grid, click the background seven times fast, or type help in the terminal.\nsource: https://github.com/btsouth/btso.dev',
  'font: 700 16px "JetBrains Mono", monospace; color: #e8703f', 'font: 12px "JetBrains Mono", monospace; line-height: 1.6',
);

const hdr = document.getElementById('hdr');
addEventListener('scroll', () => hdr?.classList.toggle('scrolled', scrollY > 8), { passive: true });

export function updateNavCount() {
  const badge = document.getElementById('navCount');
  if (!badge) return;
  const times: number[] = JSON.parse(badge.dataset.releaseTimes ?? '[]');
  const seen = lastSeen();
  const n = times.filter((t) => t > seen).length;
  badge.textContent = String(n);
  badge.hidden = n === 0;
}
updateNavCount();

// Pages are built hourly, so relative times are recomputed in the browser.
export function refreshTimes(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>('[data-ago]').forEach((el) => {
    el.textContent = (el.dataset.agoPrefix ?? '') + ago(el.dataset.ago ?? '');
  });
}
refreshTimes();
setInterval(refreshTimes, 60e3);
