// The homepage hero: a pixel field built from real GitHub activity.
//
// - Load: squares fly in, then each active day since the last visit lights once.
// - Idle: today's square breathes and a courier pixel wanders the field.
//   Hovering the courier (tapping on touch) turns it into a pixel face that
//   says one line.
// - Live: the courier carries each new GitHub event into today's square,
//   which lights up with one ripple and a label saying what happened.
// - Click the grid: it reshapes into pixel words with a different transition
//   each time, then settles back into the data.
// - Click the background: a pixel splash that shoves nearby pixels aside.
//   Seven fast splashes blow the whole hero (and header) apart; the pieces
//   bounce around Solitaire-style, then everything rebuilds itself.
import { onThemeChange } from './theme';
import { textShape, type Shape } from './pixel-font';

export type HeroData = {
  days: [string, number][];
  rel: Record<string, string[]>;
  tags: Record<string, string[]>;
  shapes: string[];
};

type Mode = 'data' | 'lit' | 'ghost';
type Kind = 'scatter' | 'wipe' | 'drop' | 'spiral';
type Anim = { fx: number; fy: number; tx: number; ty: number; start: number; dur: number; kind: Kind | 'line'; cx: number; cy: number };
type Cell = {
  d: string; c: number; l: number; rel: boolean;
  hx: number; hy: number; s: number; sx: number; sy: number; delay: number;
  anim: Anim | null; mode: Mode; prev: Mode; litT: number; litS: number;
  ox: number; oy: number; vx: number; vy: number;
};
type Amb = { x: number; y: number; s: number; a: number; sp: number; ph: number; ox: number; oy: number; vx: number; vy: number };
type Drop = { x: number; y: number; to: Cell; t: number; label: string; release: boolean; onLand?: () => void; done?: boolean };
type Particle = { x: number; y: number; vx: number; vy: number; s: number; color: string; born: number; life: number };

const DAY = 864e5;
const KINDS: Kind[] = ['scatter', 'wipe', 'drop', 'spiral'];
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const shortDay = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const rng = (seed: number) => () => ((seed = Math.imul(seed ^ (seed >>> 15), 2246822519) ^ Math.imul(seed ^ (seed >>> 13), 3266489917)) >>> 0) / 4294967296;
const hex = (h: string) => { h = h.replace('#', ''); if (h.length === 3) h = [...h].map((c) => c + c).join(''); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const mix = (a: string, b: string, k: number) => { const A = hex(a), B = hex(b); return `rgb(${A.map((v, i) => Math.round(v * k + B[i] * (1 - k))).join(',')})`; };
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const clamp01 = (k: number) => Math.max(0, Math.min(1, k));
const easeOut = (k: number) => 1 - Math.pow(1 - k, 3);
const easeInOut = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const bounceOut = (k: number) => {
  const n = 7.5625, d = 2.75;
  if (k < 1 / d) return n * k * k;
  if (k < 2 / d) return n * (k -= 1.5 / d) * k + 0.75;
  if (k < 2.5 / d) return n * (k -= 2.25 / d) * k + 0.9375;
  return n * (k -= 2.625 / d) * k + 0.984375;
};

// The courier's face when clicked: 7x7, '#' lit, 'e' an eye (closes on blink).
const FACE = ['.#####.', '#######', '##e#e##', '#######', '#.###.#', '##...##', '.#####.'];

type Opts = { say?: (n: number) => string; onOverload?: (phase: 'boom' | 'rebuilt') => void };

export function createHero(section: HTMLElement, data: HeroData, lastSeen: number, opts: Opts = {}) {
  const cv = section.querySelector('canvas')!;
  const ctx = cv.getContext('2d')!;
  const slot = section.querySelector<HTMLElement>('#graphSlot')!;
  const tip = section.querySelector<HTMLElement>('.tip')!;
  const courierTip = section.querySelector<HTMLElement>('.courier-tip');
  const courierSay = section.querySelector<HTMLElement>('.courier-say');
  const counts = data.days.map(([, c]) => c).filter(Boolean).sort((a, b) => a - b);
  const q = (k: number) => counts[Math.floor(counts.length * k)] || 1;
  const th = [q(0.25), q(0.5), q(0.8)];
  const lvl = (c: number) => (c === 0 ? 0 : c <= th[0] ? 1 : c <= th[1] ? 2 : c <= th[2] ? 3 : 4);
  const shapes = data.shapes.map(textShape).filter((s): s is Shape => Boolean(s && s.lit.length));
  const extra: Record<string, { c: number; rel?: boolean }> = {};
  const liveTags: Record<string, string[]> = {};

  let W = 0, H = 0, cols = 0, pitch = 0, gx = 0, gy = 0, ap = 16, as = 6;
  let cells: Cell[] = [], amb: Amb[] = [], today: Cell | null = null, hover: Cell | null = null;
  let fills: Record<string, string> = {}, accent = '#e8703f', accent2 = '#f2b45a', fg = '#fff', bgColor = '#121110';
  let raf = 0, running = true, catchupDone = false, last = performance.now();
  // The easter egg: fast splashes build up to an explosion and a rebuild.
  let streak: number[] = [];
  let boom: null | { start: number; x: number; y: number; rebuildAt: number; doneAt: number } = null;
  const releaseAt = new Map<object, number>();
  let domAnims: Animation[] = [];
  const trailCv = document.createElement('canvas');
  const tctx = trailCv.getContext('2d')!;
  let trailDirty = false;
  const t0 = performance.now();
  const mouse = { x: -1e3, y: -1e3, over: false, fine: matchMedia('(pointer: fine)').matches };
  const flashes = new Map<Cell, number>();
  let ripples: { x: number; y: number; t: number; soft?: boolean }[] = [];
  let drops: Drop[] = [];
  let particles: Particle[] = [];
  let trail: { x: number; y: number; t: number }[] = [];
  // Word shapes: -1 means the grid is showing the data.
  let shapeIndex = -1, morphs = 0, returnAt = 0, shapeBounds: { x0: number; x1: number } | null = null;
  const pending: (() => void)[] = [];

  function recolor() {
    const cs = getComputedStyle(document.documentElement);
    const v = (k: string) => cs.getPropertyValue(k).trim();
    accent = v('--accent'); accent2 = v('--accent2'); fg = v('--fg'); bgColor = v('--bg');
    const b = v('--bg3');
    fills = { l0: b, l1: mix(accent, b, 0.3), l2: mix(accent, b, 0.52), l3: mix(accent, b, 0.76), l4: accent };
    if (reduced) draw(performance.now());
  }

  function layout() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    W = section.clientWidth; H = section.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    trailCv.width = W * dpr; trailCv.height = H * dpr; tctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (boom) finishBoom(true);
    const firstActive = data.days.findIndex(([, c]) => c > 0);
    const activeWeeks = Math.ceil((data.days.length - Math.max(0, firstActive)) / 7) + 1;
    const weeks = Math.max(16, Math.min(W < 700 ? 20 : 53, activeWeeks));
    const days = data.days.slice(-weeks * 7);
    const firstDow = new Date(`${days[0][0]}T12:00:00`).getDay();
    cols = Math.ceil((days.length + firstDow) / 7);
    pitch = Math.max(6, Math.min(30, Math.floor((Math.min(W, 1100) - 32) / cols)));
    const size = Math.max(4, pitch - (pitch > 20 ? 6 : pitch > 10 ? 4 : 2));
    slot.style.height = `${7 * pitch}px`;
    const range = section.querySelector('#graphRange');
    if (range) range.textContent = `every day since ${new Date(`${days[0][0]}T12:00:00`).toLocaleDateString('en-US', { month: 'long' })}, one square each`;
    const sr = slot.getBoundingClientRect(), hr = section.getBoundingClientRect();
    gx = (W - cols * pitch) / 2; gy = sr.top - hr.top;
    const rand = rng(7);
    cells = days.map(([d, c], i) => {
      const k = i + firstDow, cx = Math.floor(k / 7), cy = k % 7;
      const cc = c + (extra[d]?.c ?? 0);
      return {
        d, c: cc, l: lvl(cc), rel: Boolean(data.rel[d]?.length || extra[d]?.rel),
        hx: gx + cx * pitch, hy: gy + cy * pitch, s: size, sx: rand() * W, sy: H * (0.55 + rand() * 0.6), delay: cx * 16 + rand() * 260,
        anim: null, mode: 'data', prev: 'data', litT: 0, litS: size, ox: 0, oy: 0, vx: 0, vy: 0,
      };
    });
    today = cells.find((c) => c.d === localDay()) ?? cells[cells.length - 1];
    shapeIndex = -1; shapeBounds = null;
    amb = [];
    ap = Math.max(16, pitch + 4); as = Math.max(6, size - 2);
    const inner = section.querySelector('.textcol')?.getBoundingClientRect();
    for (let y = ap / 2; y < H; y += ap) for (let x = ap / 2; x < W; x += ap) {
      const nx = Math.abs(x / W - 0.5) * 2, ny = y / H;
      const edge = Math.max(0, (nx - 0.3) / 0.7), bottom = Math.max(0, (ny - 0.6) / 0.4);
      let p = Math.min(0.75, 0.55 * Math.pow(edge, 1.3) + 0.6 * Math.pow(bottom, 1.6) + 0.04);
      if (y > gy - 24 && y < gy + 7 * pitch + 24 && x > gx - 24 && x < gx + cols * pitch + 24) continue;
      if (inner && x > inner.left - hr.left - 20 && x < inner.right - hr.left + 20 && y > inner.top - hr.top - 10 && y < inner.bottom - hr.top + 10) p *= 0.08;
      if (rand() < p) amb.push({ x: x - as / 2, y: y - as / 2, s: as, a: 0.12 + rand() * 0.4, sp: 0.4 + rand() * 1.4, ph: rand() * 6.28, ox: 0, oy: 0, vx: 0, vy: 0 });
    }
    recolor();
  }

  /* ---------- Geometry helpers ---------- */

  function animPos(a: Anim, now: number) {
    const k = clamp01((now - a.start) / Math.max(1, a.dur));
    switch (a.kind) {
      case 'drop': return { x: a.tx, y: lerp(a.fy, a.ty, bounceOut(k)), k };
      case 'spiral': {
        const r0 = Math.hypot(a.fx - a.cx, a.fy - a.cy), r1 = Math.hypot(a.tx - a.cx, a.ty - a.cy);
        const a0 = Math.atan2(a.fy - a.cy, a.fx - a.cx);
        let a1 = Math.atan2(a.ty - a.cy, a.tx - a.cx);
        while (a1 < a0) a1 += Math.PI * 2;
        a1 += Math.PI * 2;
        const e = easeInOut(k), ang = lerp(a0, a1, e), r = lerp(r0, r1, e) + Math.sin(e * Math.PI) * 40;
        return { x: a.cx + Math.cos(ang) * r, y: a.cy + Math.sin(ang) * r, k };
      }
      case 'scatter': {
        const e = easeInOut(k), u = 1 - e;
        return { x: u * u * a.fx + 2 * u * e * a.cx + e * e * a.tx, y: u * u * a.fy + 2 * u * e * a.cy + e * e * a.ty, k };
      }
      default: {
        const e = easeInOut(k);
        return { x: lerp(a.fx, a.tx, e), y: lerp(a.fy, a.ty, e), k };
      }
    }
  }

  function posOf(c: Cell, now: number) {
    if (c.anim) {
      const p = animPos(c.anim, now);
      if (p.k >= 1 && c.anim.tx === c.hx && c.anim.ty === c.hy && c.mode === 'data') c.anim = null;
      return p;
    }
    return { x: c.hx, y: c.hy, k: 1 };
  }

  const gridHit = (x: number, y: number) => {
    const x0 = shapeBounds ? Math.min(gx, shapeBounds.x0) : gx;
    const x1 = shapeBounds ? Math.max(gx + cols * pitch, shapeBounds.x1) : gx + cols * pitch;
    return x > x0 - pitch / 2 && x < x1 + pitch / 2 && y > gy - pitch / 2 && y < gy + 7 * pitch + pitch / 2;
  };

  /* ---------- Word shapes ---------- */

  function startAnim(c: Cell, now: number, tx: number, ty: number, kind: Kind | 'line', delay: number, dur: number) {
    const p = posOf(c, now);
    const a: Anim = { fx: p.x, fy: p.y, tx, ty, start: now + delay, dur, kind, cx: 0, cy: 0 };
    if (kind === 'scatter') { a.cx = Math.random() * W; a.cy = Math.random() * H; }
    if (kind === 'spiral') { a.cx = gx + (cols * pitch) / 2; a.cy = gy + 3.5 * pitch; }
    if (kind === 'drop') { a.fx = tx; a.fy = -40 - Math.random() * H * 0.25; }
    c.anim = a;
  }

  function morphTo(index: number) {
    const now = performance.now();
    const shape = shapes[index];
    const mp = Math.min(pitch, Math.floor((W - 48) / shape.cols));
    if (mp < 5) return false;
    const litS = mp === pitch ? cells[0].s : Math.max(3, mp - (mp > 20 ? 6 : mp > 10 ? 4 : 2));
    const x0 = mp === pitch ? gx + Math.round((cols - shape.cols) / 2) * pitch : gx + (cols * pitch - shape.cols * mp) / 2;
    const y0 = gy + (7 * pitch - 7 * mp) / 2;
    shapeBounds = { x0, x1: x0 + shape.cols * mp };
    const kind = KINDS[morphs++ % KINDS.length];
    const targets = shape.lit.map(([x, y]) => ({ x: x0 + x * mp, y: y0 + y * mp, col: x }));
    let pool = [...cells];
    if (kind === 'wipe') {
      pool.sort((a, b) => a.hx - b.hx || a.hy - b.hy);
      targets.sort((a, b) => a.x - b.x || a.y - b.y);
      const step = pool.length / targets.length;
      pool = targets.map((_, i) => pool[Math.floor(i * step)]);
    } else {
      for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    }
    const used = new Set<Cell>();
    let longest = 0;
    targets.forEach((t, i) => {
      const c = pool[i];
      if (!c) return;
      used.add(c);
      const delay = reduced ? 0 : kind === 'wipe' ? t.col * 22 : kind === 'drop' ? Math.random() * 380 + t.col * 6 : Math.random() * 320;
      const dur = reduced ? 0 : kind === 'drop' ? 1000 : kind === 'wipe' ? 620 : 1100;
      startAnim(c, now, t.x, t.y, kind, delay, dur);
      c.prev = c.mode; c.mode = 'lit'; c.litT = t.col / Math.max(1, shape.cols); c.litS = litS;
      longest = Math.max(longest, delay + dur);
    });
    for (const c of cells) {
      if (used.has(c)) continue;
      startAnim(c, now, c.hx, c.hy, 'line', reduced ? 0 : Math.random() * 200, reduced ? 0 : 500);
      c.prev = c.mode; c.mode = 'ghost';
    }
    shapeIndex = index;
    returnAt = now + longest + 8000;
    hover = null; tip.style.opacity = '0';
    wake();
    return true;
  }

  function morphHome() {
    const now = performance.now();
    const kind = KINDS[morphs++ % KINDS.length];
    for (const c of cells) {
      const delay = reduced ? 0 : kind === 'wipe' ? ((c.hx - gx) / pitch) * 18 : Math.random() * 300;
      startAnim(c, now, c.hx, c.hy, kind === 'drop' ? 'line' : kind, delay, reduced ? 0 : 950);
      c.prev = c.mode; c.mode = 'data';
    }
    shapeIndex = -1; shapeBounds = null;
    setTimeout(() => { while (pending.length) pending.shift()!(); }, reduced ? 0 : 1400);
    wake();
  }

  function nextShape() {
    for (let i = 1; i <= shapes.length; i++) {
      const next = shapeIndex + i;
      if (next >= shapes.length) { morphHome(); return; }
      if (morphTo(next)) return;
    }
    morphHome();
  }

  /* ---------- Splash ---------- */

  function splash(x: number, y: number, charge = 0) {
    const now = performance.now();
    const colors = [accent, accent2, accent, fg];
    const n = Math.round((20 + Math.floor(Math.random() * 10)) * (1 + charge * 0.3));
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2, speed = 0.16 + Math.random() * 0.42;
      particles.push({
        x, y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed - 0.18,
        s: as * [0.5, 0.7, 0.9][Math.floor(Math.random() * 3)],
        color: colors[Math.floor(Math.random() * colors.length)], born: now, life: 900 + Math.random() * 600,
      });
    }
    if (particles.length > 260) particles = particles.slice(-260);
    ripples.push({ x, y, t: now, soft: true });
    const push = (px: number, py: number, s: number, p: { vx: number; vy: number }) => {
      const dx = px + s / 2 - x, dy = py + s / 2 - y, d = Math.hypot(dx, dy);
      if (d > 180 || d < 1) return;
      const f = (1 - d / 180) * 0.9 * (1 + charge * 0.25);
      p.vx += (dx / d) * f; p.vy += (dy / d) * f;
    };
    for (const a of amb) push(a.x, a.y, a.s, a);
    if (shapeIndex === -1) for (const c of cells) push(c.hx, c.hy, c.s, c);
    wake();
  }

  // Springs that pull shoved pixels back home.
  // During an explosion, pieces fall and bounce instead, until their release.
  function springs(dt: number, now: number) {
    const rebuilding = boom !== null;
    const K = rebuilding ? 0.00018 : 0.0004, C = rebuilding ? 0.022 : 0.02;
    const step = (p: { ox: number; oy: number; vx: number; vy: number }, bx: number, by: number, sz: number, h: number) => {
      if (!p.vx && !p.vy && !p.ox && !p.oy) return;
      if (boom && now < (releaseAt.get(p) ?? 0)) {
        p.vy += 0.0016 * h;
        p.ox += p.vx * h; p.oy += p.vy * h;
        const x = bx + p.ox, y = by + p.oy;
        if (y > H - sz - 2) { p.oy = H - sz - 2 - by; p.vy = Math.abs(p.vy) < 0.08 ? 0 : -p.vy * 0.62; p.vx *= 0.97; }
        if (x < 0) { p.ox = -bx; p.vx = -p.vx * 0.8; }
        if (x > W - sz) { p.ox = W - sz - bx; p.vx = -p.vx * 0.8; }
        return;
      }
      p.vx += (-K * p.ox - C * p.vx) * h; p.vy += (-K * p.oy - C * p.vy) * h;
      p.ox += p.vx * h; p.oy += p.vy * h;
      if (Math.abs(p.ox) + Math.abs(p.oy) + Math.abs(p.vx) + Math.abs(p.vy) < 0.02) p.ox = p.oy = p.vx = p.vy = 0;
    };
    for (let left = dt; left > 0; left -= 16) {
      const h = Math.min(16, left);
      for (const a of amb) step(a, a.x, a.y, a.s, h);
      for (const c of cells) step(c, c.hx, c.hy, c.s, h);
    }
  }

  /* ---------- Easter egg: overload, explode, rebuild ---------- */

  const pieces = () => [
    ...document.querySelectorAll<HTMLElement>('.hdr .wrap > *'),
    ...section.querySelectorAll<HTMLElement>('.hero-inner > .pill, .hero-inner > .graph-legend, .textcol > *'),
  ];

  function overload(x: number, y: number) {
    const now = performance.now();
    boom = { start: now, x, y, rebuildAt: now + 3000, doneAt: now + 3000 + 900 + 1700 };
    streak = [];
    const fling = (bx: number, by: number, sz: number, p: { vx: number; vy: number }, power: number) => {
      const dx = bx + sz / 2 - x, dy = by + sz / 2 - y, d = Math.max(30, Math.hypot(dx, dy));
      const f = power * (0.5 + Math.random() * 0.8) * Math.min(1.6, 500 / d + 0.4);
      p.vx += (dx / d) * f + (Math.random() - 0.5) * 0.3;
      p.vy += (dy / d) * f - 0.5 - Math.random() * 0.5;
    };
    for (const a of amb) { fling(a.x, a.y, a.s, a, 0.9); releaseAt.set(a, boom.rebuildAt + Math.random() * 900); }
    // The grid comes back as a left-to-right sweep.
    for (const c of cells) { fling(c.hx, c.hy, c.s, c, 1.1); releaseAt.set(c, boom.rebuildAt + ((c.hx - gx) / Math.max(1, cols * pitch)) * 900); }
    splash(x, y, 4);
    ripples.push({ x, y, t: now });
    hover = null; tip.style.opacity = '0';
    courierTip?.classList.remove('show'); courierSay?.classList.remove('show');
    // Blow the page apart: each piece flies away from the blast, tumbles and falls.
    const sr = section.getBoundingClientRect(), cx = sr.left + x, cy = sr.top + y;
    domAnims = pieces().map((el) => {
      const r = el.getBoundingClientRect();
      const ex = r.left + r.width / 2, ey = r.top + r.height / 2;
      const dx = (ex - cx) * 0.9 + (Math.random() - 0.5) * 300, up = -(120 + Math.random() * 240);
      const rot = (Math.random() - 0.5) * 70, fall = innerHeight - ey + 200 + Math.random() * 200;
      return el.animate(
        [
          { transform: 'none', opacity: 1 },
          { transform: `translate(${dx * 0.55}px, ${up + (ey < cy ? -60 : 0)}px) rotate(${rot * 0.5}deg)`, opacity: 1, offset: 0.3 },
          { transform: `translate(${dx}px, ${fall}px) rotate(${rot}deg)`, opacity: 0 },
        ],
        { duration: 1300 + Math.random() * 400, easing: 'cubic-bezier(.25,.1,.55,1)', fill: 'forwards' },
      );
    });
    section.animate(
      [{ transform: 'translate(0,0)' }, { transform: 'translate(-9px,6px)' }, { transform: 'translate(8px,-7px)' }, { transform: 'translate(-5px,3px)' }, { transform: 'translate(0,0)' }],
      { duration: 420, easing: 'ease-out' },
    );
    opts.onOverload?.('boom');
    setTimeout(rebuildDom, 3000 + 500);
    setTimeout(() => finishBoom(false), boom.doneAt - now);
    wake();
  }

  // Pieces drop back into place, header first, with a little overshoot.
  function rebuildDom() {
    const els = pieces();
    domAnims.forEach((a) => a.cancel());
    domAnims = els.map((el, i) =>
      el.animate([{ transform: 'translateY(-46px) scale(.9)', opacity: 0 }, { transform: 'none', opacity: 1 }], {
        duration: 650, delay: i * 85, easing: 'cubic-bezier(.2,1.5,.4,1)', fill: 'backwards',
      }),
    );
  }

  function finishBoom(abrupt: boolean) {
    if (!boom) return;
    boom = null;
    releaseAt.clear();
    if (abrupt) {
      domAnims.forEach((a) => a.cancel());
      for (const p of [...amb, ...cells]) p.ox = p.oy = p.vx = p.vy = 0;
    }
    domAnims = [];
    opts.onOverload?.('rebuilt');
    while (pending.length) pending.shift()!();
    if (!abrupt && !reduced) setTimeout(() => { if (courier.mode === 'wander') talk('ok. who did that?'); }, 600);
  }

  /* ---------- Courier: a wandering pixel that carries live events home ---------- */

  type Delivery = { to: Cell; label: string; onArrive: () => void };
  const courier = { x: -100, y: -100, trail: [] as { x: number; y: number }[], lastTrail: 0, mode: 'wander' as 'wander' | 'deliver' | 'hold' | 'talk', talk: { start: 0, until: 0, blink: 0, n: 0 }, hold: { start: 0, until: 0, fromY: 0, cell: null as Cell | null }, quietUntil: 0, path: null as null | { fx: number; fy: number; cx: number; cy: number; tx: number; ty: number; start: number; dur: number; job?: Delivery }, blendFrom: null as null | { x: number; y: number; t: number } };
  const deliveries: Delivery[] = [];

  const wanderAt = (now: number) => ({
    x: W * (0.5 + 0.44 * Math.sin(now * 0.000093 + 1.3) * Math.cos(now * 0.000041)),
    y: H * (0.56 + 0.36 * Math.sin(now * 0.000071 + 0.4)),
  });

  // Where the courier sits while it holds on a delivered square: just above it.
  const perchY = (c: Cell) => c.hy - courierSize() * 0.9;
  let labelTimer = 0;

  function deliverLabel(c: Cell, label: string, ms: number) {
    if (!courierTip) return;
    courierTip.innerHTML = `<b>${esc(label)}</b> · just now`;
    courierTip.style.left = `${c.hx + c.s / 2}px`;
    courierTip.style.top = `${perchY(c) - courierSize()}px`;
    courierTip.classList.add('show');
    clearTimeout(labelTimer);
    labelTimer = window.setTimeout(() => courierTip.classList.remove('show'), ms);
  }

  function updateCourier(now: number) {
    if (courier.mode === 'talk') {
      if (now > courier.talk.until) {
        courier.mode = 'wander';
        courier.blendFrom = { x: courier.x, y: courier.y, t: now - 900 };
      }
      return;
    }
    if (courier.mode === 'wander') {
      const w = wanderAt(now);
      if (courier.blendFrom) {
        const k = clamp01((now - courier.blendFrom.t) / 1500), e = easeInOut(k);
        courier.x = lerp(courier.blendFrom.x, w.x, e); courier.y = lerp(courier.blendFrom.y, w.y, e);
        if (k >= 1) courier.blendFrom = null;
      } else { courier.x = w.x; courier.y = w.y; }
      const job = deliveries.shift();
      if (job) {
        const tx = job.to.hx + job.to.s / 2, ty = job.to.hy + job.to.s / 2;
        courier.path = { fx: courier.x, fy: courier.y, cx: (courier.x + tx) / 2, cy: Math.min(courier.y, ty) - 140, tx, ty, start: now, dur: 1400, job };
        courier.mode = 'deliver';
      }
    } else if (courier.mode === 'hold' && courier.hold.cell) {
      // Sit above the square with a gentle bob, then head back out.
      const h = courier.hold, c = h.cell!, k = easeOut(clamp01((now - h.start) / 350));
      courier.x = c.hx + c.s / 2;
      courier.y = lerp(h.fromY, perchY(c), k) + Math.sin((now - h.start) / 320) * 2.5 * k;
      if (now > h.until) {
        courier.mode = 'wander';
        courier.blendFrom = { x: courier.x, y: courier.y, t: now };
      }
    } else if (courier.path) {
      const p = courier.path, k = clamp01((now - p.start) / p.dur), e = easeInOut(k), u = 1 - e;
      courier.x = u * u * p.fx + 2 * u * e * p.cx + e * e * p.tx;
      courier.y = u * u * p.fy + 2 * u * e * p.cy + e * e * p.ty;
      if (k >= 1) {
        if (courier.mode === 'deliver' && p.job) {
          p.job.onArrive();
          // Hold for about 5 seconds; shorter when more deliveries are waiting.
          const ms = deliveries.length ? 2500 : 5000;
          deliverLabel(p.job.to, p.job.label, ms);
          courier.mode = 'hold';
          courier.path = null;
          courier.hold = { start: now, until: now + ms, fromY: courier.y, cell: p.job.to };
        }
      }
    }
    if (now - courier.lastTrail > 45) {
      courier.trail.unshift({ x: courier.x, y: courier.y });
      courier.trail.length = Math.min(courier.trail.length, 6);
      courier.lastTrail = now;
    }
  }

  const courierSize = () => Math.max(4, as * 0.7);

  function talk(say?: string) {
    const now = performance.now();
    const line = say ?? opts.say?.(courier.talk.n++) ?? 'hi.';
    const dur = 2200 + line.length * 45;
    courier.mode = 'talk';
    courier.path = null;
    courier.trail = [];
    courier.talk = { start: now, until: now + dur, blink: now + 700 + Math.random() * 600, n: courier.talk.n };
    courier.quietUntil = now + dur + 4000;
    if (courierSay) {
      const half = Math.min(170, W / 2 - 12);
      const left = Math.max(half, Math.min(W - half, courier.x));
      courierSay.style.left = `${left}px`;
      courierSay.style.setProperty('--tail', `${Math.max(-half + 16, Math.min(half - 16, courier.x - left))}px`);
      courierSay.style.top = `${courier.y - Math.max(6, as * 0.58) * 1.22 * 3.5 - 18}px`;
      courierSay.textContent = '';
      courierSay.classList.add('show');
      let i = 0;
      const type = () => {
        if (courier.mode !== 'talk') return;
        courierSay.textContent = line.slice(0, ++i);
        if (i < line.length) setTimeout(type, 22);
      };
      setTimeout(type, 240);
      setTimeout(() => courierSay.classList.remove('show'), dur - 250);
    }
    wake();
  }

  function drawFace(now: number) {
    const { start, until, blink } = courier.talk;
    const k = easeOut(clamp01(Math.min((now - start) / 280, (until - now) / 220)));
    const p = Math.max(6, as * 0.58), step = p * 1.22;
    const eyesShut = now > blink && now < blink + 140;
    // A backing plate so the eyes and smile read as holes, not background noise.
    const plate = step * 7 + p * 0.9;
    ctx.globalAlpha = 0.92 * k;
    ctx.fillStyle = bgColor;
    ctx.beginPath();
    ctx.roundRect(courier.x - (plate * k) / 2, courier.y - (plate * k) / 2, plate * k, plate * k, 10);
    ctx.fill();
    ctx.fillStyle = accent2;
    FACE.forEach((row, y) => [...row].forEach((ch, x) => {
      if (ch === '.' || (ch === 'e' && !eyesShut)) return;
      const tx = courier.x + (x - 3) * step, ty = courier.y + (y - 3) * step;
      ctx.globalAlpha = k;
      ctx.fillRect(lerp(courier.x, tx, k) - p / 2, lerp(courier.y, ty, k) - p / 2, p, p);
    }));
    ctx.globalAlpha = 1;
  }

  function drawCourier(now: number) {
    if (courier.mode === 'talk') { drawFace(now); return; }
    const s = courierSize();
    ctx.fillStyle = accent2;
    courier.trail.forEach((p, i) => {
      if (!i) return;
      ctx.globalAlpha = 0.35 * (1 - i / courier.trail.length);
      const z = s * (1 - i * 0.08);
      ctx.fillRect(p.x - z / 2, p.y - z / 2, z, z);
    });
    ctx.globalAlpha = 1;
    ctx.shadowColor = accent2; ctx.shadowBlur = 14;
    ctx.fillRect(courier.x - s / 2, courier.y - s / 2, s, s);
    ctx.shadowBlur = 0;
  }

  /* ---------- Drawing ---------- */

  function wave(x: number, y: number, now: number) {
    let v = 0;
    for (const r of ripples) {
      const age = now - r.t, front = age * (r.soft ? 0.45 : 0.6), d = Math.hypot(x - r.x, y - r.y);
      v = Math.max(v, Math.exp(-((d - front) ** 2) / (2 * 24 * 24)) * (1 - age / 1800) * (r.soft ? 0.5 : 1));
    }
    return v;
  }

  function square(x: number, y: number, s: number, grow: number) {
    ctx.beginPath();
    ctx.roundRect(x - grow / 2, y - grow / 2, s + grow, s + grow, Math.min(4, s / 5));
    ctx.fill();
  }

  function draw(now: number) {
    const t = now - t0;
    const dt = Math.min(64, now - last);
    last = now;
    if (!reduced) springs(dt, now);
    if (shapeIndex !== -1 && now > returnAt) morphHome();
    ctx.clearRect(0, 0, W, H);

    // Solitaire trails: pieces stamp themselves while they fly, then fade out.
    if (boom || trailDirty) {
      tctx.globalCompositeOperation = 'destination-out';
      tctx.globalAlpha = 1;
      tctx.fillStyle = `rgba(0,0,0,${boom && now < boom.rebuildAt ? 0.045 : 0.2})`;
      tctx.fillRect(0, 0, W, H);
      tctx.globalCompositeOperation = 'source-over';
      if (boom && now < boom.rebuildAt) {
        for (const c of cells) {
          tctx.globalAlpha = 0.5;
          tctx.fillStyle = c.rel ? accent2 : fills[`l${Math.max(1, c.l)}`];
          tctx.fillRect(c.hx + c.ox, c.hy + c.oy, c.s, c.s);
        }
        trailDirty = true;
      } else if (!boom) {
        trailDirty = false;
        tctx.clearRect(0, 0, W, H);
      }
      ctx.globalAlpha = 1;
      ctx.drawImage(trailCv, 0, 0, W, H);
    }

    // Ambient field and cursor trail
    ctx.fillStyle = accent;
    for (const a of amb) {
      const near = Math.max(0, 1 - Math.hypot(a.x - mouse.x, a.y - mouse.y) / 140);
      const tw = reduced ? 1 : 0.55 + 0.45 * Math.sin((t / 1000) * a.sp + a.ph);
      ctx.globalAlpha = Math.min(1, a.a * tw * 0.8 + near * 0.8 + wave(a.x, a.y, now) * 0.9) * Math.min(1, reduced ? 1 : t / 900);
      ctx.fillRect(a.x + a.ox, a.y + a.oy, a.s, a.s);
    }
    trail = trail.filter((p) => now - p.t < 520);
    for (const p of trail) {
      ctx.globalAlpha = (1 - (now - p.t) / 520) * 0.6;
      ctx.fillRect(p.x - as / 2, p.y - as / 2, as, as);
    }

    // The grid
    for (const c of cells) {
      const ik = reduced ? 1 : clamp01((t - c.delay) / 850);
      if (ik <= 0) continue;
      let x: number, y: number, mk = 1, alpha = 1;
      if (ik < 1 && !c.anim) {
        const e = easeOut(ik);
        x = lerp(c.sx, c.hx, e); y = lerp(c.sy, c.hy, e); alpha = Math.min(1, ik * 1.6);
      } else {
        const p = posOf(c, now);
        x = p.x; y = p.y; mk = c.anim ? clamp01(p.k * 1.2) : 1;
      }
      x += c.ox; y += c.oy;
      const f = flashes.get(c), fk = f ? (now - f) / 900 : 1;
      const grow = (hover === c ? 4 : 0) + (fk < 1 ? 5 * (1 - fk) : 0);
      const size = (m: Mode) => (m === 'lit' ? c.litS : c.s);
      const s = lerp(size(c.prev), size(c.mode), mk);
      const paint = (m: Mode, a: number) => {
        if (a < 0.01) return;
        if (m === 'data') {
          let al = a;
          if (c === today && !reduced && ik >= 1) al *= 0.72 + 0.28 * Math.sin(now / 900);
          ctx.globalAlpha = al; ctx.fillStyle = fills[`l${c.l}`];
          square(x, y, s, grow);
          if (c.rel && ik > 0.85) {
            const d = Math.max(3, Math.round(s * 0.36));
            ctx.fillStyle = accent2; ctx.fillRect(x + (s - d) / 2, y + (s - d) / 2, d, d);
          }
          const glow = Math.max(fk < 1 ? Math.pow(1 - fk, 2) : 0, wave(c.hx + c.s / 2, c.hy + c.s / 2, now) * 0.6);
          if (glow > 0.01) { ctx.globalAlpha = glow * a; ctx.fillStyle = accent2; square(x, y, s, grow); }
        } else if (m === 'lit') {
          ctx.globalAlpha = a; ctx.fillStyle = mix(accent2, accent, c.litT);
          square(x, y, s, 0);
        } else {
          ctx.globalAlpha = a * 0.06; ctx.fillStyle = fills.l1;
          square(x, y, s, 0);
        }
      };
      paint(c.prev, alpha * (1 - mk));
      paint(c.mode, alpha * mk);
      if (c === today && c.mode === 'data' && mk >= 1 && ik >= 1) {
        ctx.globalAlpha = 0.55; ctx.strokeStyle = fg; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.roundRect(x - 3.5, y - 3.5, s + 7, s + 7, Math.min(6, s / 4)); ctx.stroke();
      }
    }
    for (const [c, ft] of flashes) if (now - ft > 900) flashes.delete(c);
    ripples = ripples.filter((r) => now - r.t < 1800);

    // "Since your last visit": each active day lights up once, oldest first
    if (!catchupDone && !reduced && t > 1700) {
      catchupDone = true;
      const since = localDay(new Date(Math.min(lastSeen, Date.now() - 3 * DAY)));
      const active = cells.filter((c) => c.d >= since && c.c > 0);
      active.forEach((c, i) => setTimeout(() => {
        flashes.set(c, performance.now());
        if (i === active.length - 1) ripples.push({ x: c.hx + c.s / 2, y: c.hy + c.s / 2, t: performance.now(), soft: true });
      }, i * 150));
    }

    // Live drops: a pixel falls from the "latest" pill into today's square
    for (const dr of drops) {
      const k = Math.min(1, (now - dr.t) / 700);
      const tx = dr.to.hx + dr.to.s / 2, ty = dr.to.hy + dr.to.s / 2;
      ctx.fillStyle = accent2;
      for (let j = 3; j >= 0; j--) {
        const kk = Math.max(0, k - j * 0.05);
        const sz = dr.to.s * (j ? 0.6 : 0.8);
        ctx.globalAlpha = j ? 0.18 * (4 - j) : 1;
        ctx.fillRect(lerp(dr.x, tx, easeOut(kk)) - sz / 2, lerp(dr.y, ty, kk * kk) - sz / 2, sz, sz);
      }
      if (k >= 1 && !dr.done) { dr.done = true; land(dr); }
    }
    drops = drops.filter((d) => !d.done);

    // Splash particles
    particles = particles.filter((p) => now - p.born < p.life);
    for (const p of particles) {
      p.vy += 0.0011 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      ctx.globalAlpha = 1 - Math.pow((now - p.born) / p.life, 2);
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x - p.s / 2), Math.round(p.y - p.s / 2), p.s, p.s);
    }

    if (!reduced && !boom) { updateCourier(now); if (t > 2500) drawCourier(now); }

    // The blast itself: a flash and a shockwave ring.
    if (boom) {
      const k = (now - boom.start) / 700;
      if (k < 1) {
        ctx.globalAlpha = 0.55 * Math.pow(1 - k, 2);
        ctx.fillStyle = accent2; ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = 1 - k; ctx.strokeStyle = accent2; ctx.lineWidth = 8 * (1 - k) + 1;
        ctx.beginPath(); ctx.arc(boom.x, boom.y, k * Math.max(W, H) * 0.8, 0, Math.PI * 2); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  function land(dr: Drop) {
    const c = dr.to, now = performance.now();
    (extra[c.d] ??= { c: 0 }).c += 1;
    c.c += 1; c.l = lvl(c.c);
    if (dr.release) { c.rel = true; extra[c.d].rel = true; }
    (liveTags[c.d] ??= []).unshift(dr.label);
    flashes.set(c, now);
    ripples.push({ x: c.hx + c.s / 2, y: c.hy + c.s / 2, t: now });
    dr.onLand?.();
  }

  function loop(now: number) { if (!running) return; draw(now); raf = requestAnimationFrame(loop); }
  function wake() { if (!running) { running = true; last = performance.now(); raf = requestAnimationFrame(loop); } else if (reduced) draw(performance.now()); }

  /** Animate one live event into today's square. */
  function live(label: string, release: boolean, onLand?: () => void) {
    if (!today) return onLand?.();
    if (boom) { pending.push(() => live(label, release, onLand)); return; }
    if (shapeIndex !== -1) { pending.push(() => live(label, release, onLand)); morphHome(); return; }
    const drop: Drop = { x: 0, y: 0, to: today, t: performance.now(), label, release, onLand };
    if (reduced) { land(drop); draw(performance.now()); return; }
    // Once the courier is out, it carries the event; before that, it drops from the pill.
    if (performance.now() - t0 > 2500) {
      deliveries.push({ to: today, label, onArrive: () => land(drop) });
      wake();
      return;
    }
    const pill = document.getElementById('pill')?.getBoundingClientRect(), sr = section.getBoundingClientRect();
    drop.x = pill ? pill.left - sr.left + pill.width / 2 : W / 2;
    drop.y = pill ? pill.bottom - sr.top : 0;
    drops.push(drop);
    wake();
  }

  /* ---------- Input ---------- */

  const courierHit = (x: number, y: number, reach: number) =>
    !reduced && performance.now() - t0 > 2500 && courier.mode !== 'deliver' && courier.mode !== 'hold' &&
    Math.hypot(x - courier.x, y - courier.y) < reach;
  const local = (e: PointerEvent | MouseEvent) => { const r = section.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

  section.addEventListener('pointermove', (e) => {
    const p = local(e);
    mouse.x = p.x; mouse.y = p.y; mouse.over = true;
    if (e.pointerType === 'mouse' && !boom && courierHit(p.x, p.y, 34) && performance.now() > courier.quietUntil) talk();
    if (e.pointerType === 'mouse' && !reduced && !gridHit(p.x, p.y)) {
      const sx = Math.floor(p.x / ap) * ap + ap / 2, sy = Math.floor(p.y / ap) * ap + ap / 2;
      const head = trail[trail.length - 1];
      if (!head || head.x !== sx || head.y !== sy) { trail.push({ x: sx, y: sy, t: performance.now() }); if (trail.length > 16) trail.shift(); }
    }
    const hit = shapeIndex === -1 && !boom ? cells.find((c) => p.x >= c.hx - 1 && p.x <= c.hx + c.s + 1 && p.y >= c.hy - 1 && p.y <= c.hy + c.s + 1) ?? null : null;
    hover = hit;
    if (hit) {
      const rel = [...(liveTags[hit.d] ?? []), ...(data.tags[hit.d] ?? data.rel[hit.d] ?? [])];
      tip.innerHTML = `<b>${shortDay(hit.d)}</b> · ${hit.c} contribution${hit.c === 1 ? '' : 's'}` +
        (rel.length ? `<br>${rel.slice(0, 4).map((s) => `<span class="r">▲</span> ${esc(s)}`).join('<br>')}${rel.length > 4 ? `<br>+${rel.length - 4} more` : ''}` : '') +
        '<br><span class="hint">click the grid to play</span>';
      tip.style.left = `${hit.hx + hit.s / 2}px`;
      tip.style.top = `${hit.hy}px`;
      tip.style.opacity = '1';
    } else tip.style.opacity = '0';
    if (reduced) draw(performance.now());
  });
  section.addEventListener('pointerleave', () => { mouse.x = mouse.y = -1e3; mouse.over = false; hover = null; tip.style.opacity = '0'; });
  section.addEventListener('click', (e) => {
    if ((e.target as Element).closest('a, button, input, textarea, select, summary')) return;
    if (performance.now() - t0 < 1800 || boom) return;
    const p = local(e);
    const touch = (e as PointerEvent).pointerType === 'touch';
    if (courierHit(p.x, p.y, touch ? 40 : 34)) { if (touch && performance.now() > courier.quietUntil) talk(); }
    else if (gridHit(p.x, p.y)) nextShape();
    else if (!reduced) {
      // Fast splashes build up: bigger bursts and a growing shake, then boom.
      const now = performance.now();
      streak = streak.filter((t) => now - t < 3500);
      streak.push(now);
      const n = streak.length;
      if (n >= 7 && shapeIndex === -1) { overload(p.x, p.y); return; }
      const charge = Math.max(0, n - 2);
      splash(p.x, p.y, charge);
      if (charge) {
        const a = charge * 1.6;
        section.querySelector('.hero-inner')?.animate(
          [{ transform: 'none' }, { transform: `translate(${-a}px, ${a * 0.6}px)` }, { transform: `translate(${a}px, ${-a * 0.5}px)` }, { transform: 'none' }],
          { duration: 260, easing: 'ease-out' },
        );
      }
    }
  });

  const ro = new ResizeObserver(() => layout());
  ro.observe(section);
  const vis = new IntersectionObserver(([e]) => {
    const was = running;
    running = e.isIntersecting && !reduced;
    if (running && !was) { last = performance.now(); raf = requestAnimationFrame(loop); }
  });
  vis.observe(section);
  onThemeChange(recolor);
  layout();
  if (reduced) draw(performance.now()); else raf = requestAnimationFrame(loop);

  return { live, destroy: () => { running = false; cancelAnimationFrame(raf); ro.disconnect(); vis.disconnect(); } };
}
