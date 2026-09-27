// Social preview images (1200x630) for the homepage, ship log, Omarchy hub and
// every app page, drawn from the same data as the site. Runs before each build,
// so the images follow the hourly-ish data refreshes.
//
// Text is monospace JetBrains Mono from scripts/og-fonts (SIL OFL), loaded
// explicitly so the build machine renders exactly what you see locally.
import { Resvg } from '@resvg/resvg-js';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root));
const projects = JSON.parse(read('src/data/projects.json'));
const github = JSON.parse(read('src/data/github.json'));
const fontFiles = [400, 700, 800].map((w) => new URL(`scripts/og-fonts/jetbrains-mono-${w}.ttf`, root).pathname);

const W = 1200, H = 630;
const C = { bg: '#121110', bg2: '#1a1917', bg3: '#23211e', fg: '#ece6da', fg2: '#b9b2a5', fg3: '#8a8479', line: '#2c2a26', accent: '#e8703f', accent2: '#f2b45a' };
const FONT = 'JetBrains Mono';
const GROUPS = { omarchy: 'Omarchy', windows: 'Windows', ai: 'AI & dev tools' };

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);
const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const mix = (a, b, k) => { const A = hex(a), B = hex(b); return `rgb(${A.map((v, i) => Math.round(v * k + B[i] * (1 - k))).join(',')})`; };
const rng = (seed) => () => ((seed = Math.imul(seed ^ (seed >>> 15), 2246822519) ^ Math.imul(seed ^ (seed >>> 13), 3266489917)) >>> 0) / 4294967296;
const hash = (s) => [...s].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);
const fmt = (n) => n.toLocaleString('en-US');

// Monospace, so wrapping by character count is exact: each glyph is 0.6em wide.
function wrap(text, size, width, maxLines = 3) {
  const perLine = Math.floor(width / (size * 0.6));
  const lines = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    if ((line ? line.length + 1 : 0) + word.length > perLine && line) { lines.push(line); line = word; } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, '…'); }
  return lines;
}
const text = (x, y, s, { size = 24, weight = 400, fill = C.fg, anchor = 'start', spacing = 0 } = {}) =>
  `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" letter-spacing="${spacing}">${esc(s)}</text>`;
const lines = (x, y, arr, size, lh, opts) => arr.map((l, i) => text(x, y + i * size * lh, l, { size, ...opts })).join('');

// Sparse ambient pixels, heavier toward the edges and bottom, like the hero.
function ambient(seed, keepOut = []) {
  const r = rng(seed); const out = [];
  for (let y = 12; y < H; y += 30) for (let x = 12; x < W; x += 30) {
    const nx = Math.abs(x / W - 0.5) * 2, ny = y / H;
    const p = Math.min(0.6, 0.5 * Math.max(0, (nx - 0.45) / 0.55) ** 1.3 + 0.45 * Math.max(0, (ny - 0.7) / 0.3) ** 1.5 + 0.02);
    if (keepOut.some(([x0, y0, x1, y1]) => x > x0 && x < x1 && y > y0 && y < y1)) continue;
    if (r() < p) out.push(`<rect x="${x}" y="${y}" width="18" height="18" rx="3" fill="${C.accent}" opacity="${(0.08 + r() * 0.3).toFixed(2)}"/>`);
  }
  return out.join('');
}

const logo = (x, y) => {
  const on = [0, 4, 5, 7];
  let s = '';
  for (let i = 0; i < 9; i++) s += `<rect x="${x + (i % 3) * 10}" y="${y + Math.floor(i / 3) * 10}" width="8" height="8" rx="1.5" fill="${C.accent}" opacity="${on.includes(i) ? 1 : 0.3}"/>`;
  return s + text(x + 44, y + 25, 'btso', { size: 30, weight: 800, spacing: -0.5 }) + text(x + 116, y + 25, '.', { size: 30, weight: 800, fill: C.accent }) + text(x + 134, y + 25, 'dev', { size: 30, weight: 800, spacing: -0.5 });
};

const frame = (body, seed, keepOut) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="${C.bg}"/>${ambient(seed, keepOut)}${body}</svg>`;

function render(svg, out) {
  const png = new Resvg(svg, { font: { fontFiles, loadSystemFonts: false, defaultFontFamily: FONT }, fitTo: { mode: 'width', value: W } }).render().asPng();
  mkdirSync(new URL('.', new URL(out, root)), { recursive: true });
  writeFileSync(new URL(out, root), png);
}

/* ---------- Shared data ---------- */
const now = Date.parse(github.generatedAt);
const repoOf = (p) => github.repos[p.repo] ?? { stars: 0, latest: null, releaseDates: [], releases: [] };
const stars = projects.reduce((n, p) => n + repoOf(p).stars, 0);
const releases = projects.flatMap((p) => repoOf(p).releases.map((r) => ({ ...r, p }))).sort((a, b) => b.at.localeCompare(a.at));
const releases30 = releases.filter((r) => now - Date.parse(r.at) < 30 * 864e5).length;
const relDays = new Set(projects.flatMap((p) => repoOf(p).releaseDates.map((d) => d.slice(0, 10))));

/* ---------- Homepage ---------- */
{
  const days = github.days;
  const counts = days.map(([, c]) => c).filter(Boolean).sort((a, b) => a - b);
  const q = (k) => counts[Math.floor(counts.length * k)] || 1;
  const lvl = (c) => (c === 0 ? 0 : c <= q(0.25) ? 1 : c <= q(0.5) ? 2 : c <= q(0.8) ? 3 : 4);
  const fills = [C.bg3, mix(C.accent, C.bg3, 0.3), mix(C.accent, C.bg3, 0.52), mix(C.accent, C.bg3, 0.76), C.accent];
  const weeks = 17, pitch = 26, size = 21, gx = 680, gy = 150;
  const recent = days.slice(-weeks * 7);
  const firstDow = new Date(`${recent[0][0]}T12:00:00Z`).getUTCDay();
  let grid = '';
  recent.forEach(([d, c], i) => {
    const k = i + firstDow, x = gx + Math.floor(k / 7) * pitch, y = gy + (k % 7) * pitch;
    grid += `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="4" fill="${fills[lvl(c)]}"/>`;
    if (relDays.has(d)) grid += `<rect x="${x + 7}" y="${y + 7}" width="7" height="7" fill="${C.accent2}"/>`;
  });
  const headline = ['I make software', 'I want on my own'];
  const body =
    logo(70, 60) +
    text(70, 250, 'Tyler South', { size: 30, weight: 700, fill: C.fg2 }) +
    lines(70, 318, headline, 50, 1.14, { weight: 800, spacing: -1.5 }) +
    text(70, 318 + 2 * 57, 'computer', { size: 50, weight: 800, fill: C.accent, spacing: -1.5 }) + text(70 + 8 * 30 - 12, 318 + 2 * 57, '.', { size: 50, weight: 800 }) +
    text(70, 520, `${projects.length} apps · ${fmt(stars)} stars · ${releases30} releases in 30 days`, { size: 22, fill: C.fg3 }) +
    grid +
    text(gx, gy + 7 * pitch + 32, 'every square is a day of GitHub activity', { size: 15, fill: C.fg3 });
  const svg = frame(body, 11, [[40, 40, 660, 560], [gx - 30, gy - 30, gx + weeks * pitch + 30, gy + 7 * pitch + 50]]);
  render(svg, 'public/og/home.png');
  render(svg, 'public/og-image.png'); // the old default path, for links shared before the redesign
}

/* ---------- Ship log ---------- */
{
  const day = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' });
  let list = '';
  releases.slice(0, 5).forEach((r, i) => {
    const y = 326 + i * 54;
    list += `<rect x="70" y="${y - 22}" width="16" height="16" rx="3" fill="${r.p.accent}"/>` +
      text(104, y - 6, r.p.name, { size: 28, weight: 700 }) +
      text(104 + (r.p.name.length + 1) * 16.8, y - 6, r.tag, { size: 28, fill: C.accent2 }) +
      text(1130, y - 6, day(r.at), { size: 22, fill: C.fg3, anchor: 'end' });
  });
  const body = logo(70, 60) +
    text(70, 200, 'Ship log', { size: 76, weight: 800, spacing: -2 }) +
    text(70, 244, `Every release, straight from GitHub. ${releases30} in the last 30 days.`, { size: 22, fill: C.fg2 }) +
    `<path d="M70 262h1060" stroke="${C.line}" stroke-width="2"/>` + list;
  render(frame(body, 23, [[40, 40, 1160, 590]]), 'public/og/ship.png');
}

/* ---------- Omarchy hub ---------- */
{
  const omarchy = projects.filter((p) => p.group === 'omarchy');
  const omStars = omarchy.reduce((n, p) => n + repoOf(p).stars, 0);
  let chips = '', x = 70, y = 330;
  for (const p of omarchy) {
    const w = p.name.length * 13.2 + 58;
    if (x + w > 1130) { x = 70; y += 62; }
    chips += `<rect x="${x}" y="${y - 32}" width="${w}" height="46" rx="10" fill="${mix(p.accent, C.bg, 0.16)}" stroke="${mix(p.accent, C.line, 0.45)}"/>` +
      `<rect x="${x + 16}" y="${y - 16}" width="14" height="14" rx="3" fill="${p.accent}"/>` + text(x + 40, y - 3, p.name, { size: 22, weight: 700 });
    x += w + 14;
  }
  const body = logo(70, 60) +
    text(70, 200, 'Omarchy things', { size: 76, weight: 800, spacing: -2 }) +
    text(70, 250, `${omarchy.length} apps and plugins · ${fmt(omStars)} stars · they all follow your theme`, { size: 22, fill: C.fg2 }) + chips;
  render(frame(body, 37, [[40, 40, 1160, y + 40]]), 'public/og/omarchy.png');
}

/* ---------- One per app ---------- */
for (const p of projects) {
  const repo = repoOf(p);
  let icon;
  if (p.icon) {
    const file = read(`public${p.icon}`);
    const mime = p.icon.endsWith('.svg') ? 'image/svg+xml' : 'image/png';
    icon = `<rect x="70" y="170" width="112" height="112" rx="26" fill="${mix(p.accent, C.bg3, 0.18)}" stroke="${mix(p.accent, C.line, 0.3)}" stroke-width="2"/>` +
      `<image x="92" y="192" width="68" height="68" href="data:${mime};base64,${file.toString('base64')}"/>`;
  } else {
    const initials = p.name.replace(/[^A-Za-z ]/g, ' ').trim().split(/\s+|(?=[A-Z])/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
    icon = `<rect x="70" y="170" width="112" height="112" rx="26" fill="${mix(p.accent, C.bg3, 0.18)}" stroke="${mix(p.accent, C.line, 0.3)}" stroke-width="2"/>` +
      text(126, 244, initials, { size: 42, weight: 800, fill: p.accent, anchor: 'middle' });
  }
  // The app's pixel pattern down the right side, like its card on /omarchy.
  const r = rng(hash(p.id));
  let art = '';
  for (let yy = 0; yy < 12; yy++) for (let xx = 0; xx < 9; xx++) {
    if (r() < 0.38) art += `<rect x="${860 + xx * 34}" y="${108 + yy * 34}" width="28" height="28" rx="4" fill="${p.accent}" opacity="${(0.15 + r() * 0.75).toFixed(2)}"/>`;
  }
  const meta = [repo.latest, `${fmt(repo.stars)} ${repo.stars === 1 ? 'star' : 'stars'}`, GROUPS[p.group]].filter(Boolean).join('  ·  ');
  const body = logo(70, 60) + art +
    `<rect x="840" y="88" width="330" height="440" fill="url(#fade)"/>` +
    icon +
    text(210, 250, p.name, { size: p.name.length > 12 ? 58 : 72, weight: 800, spacing: -2 }) +
    lines(70, 360, wrap(p.tagline, 32, 730, 3), 32, 1.35, { fill: C.fg2 }) +
    text(70, 540, meta, { size: 24, fill: C.fg3 }) +
    text(1130, 580, `btso.dev/p/${p.id}`, { size: 20, fill: C.fg3, anchor: 'end' });
  const svg = frame(`<defs><linearGradient id="fade" x1="0" x2="1"><stop offset="0" stop-color="${C.bg}" stop-opacity="1"/><stop offset="0.35" stop-color="${C.bg}" stop-opacity="0"/></linearGradient></defs>${body}`, hash(p.id), [[0, 0, W, H]]);
  render(svg, `public/og/p/${p.id}.png`);
}

console.log(`Generated ${3 + projects.length} social images in public/og/`);
