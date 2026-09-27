// Twinkling pixel band in the ship log and Omarchy page headers.
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

function pixelBand(el: HTMLElement | null) {
  if (!el) return;
  const n = 24 * 8;
  el.innerHTML = '<i></i>'.repeat(n);
  const cells = [...el.querySelectorAll<HTMLElement>('i')];
  let seed = 3;
  const rand = () => ((seed = Math.imul(seed ^ (seed >>> 15), 2246822519) ^ Math.imul(seed ^ (seed >>> 13), 3266489917)) >>> 0) / 4294967296;
  const set = (c: HTMLElement, p: number) => { c.style.opacity = rand() < p ? (0.1 + rand() * 0.8).toFixed(2) : '0'; };
  requestAnimationFrame(() => cells.forEach((c) => set(c, 0.28)));
  if (!reduced) setInterval(() => { if (!document.hidden) for (let i = 0; i < 18; i++) set(cells[Math.floor(rand() * n)], 0.4); }, 420);
}
pixelBand(document.getElementById('pxBand'));
