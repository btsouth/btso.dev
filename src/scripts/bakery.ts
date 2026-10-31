// The Family Bakery merge tray. Tap the bread box for an egg; drag (or tap one,
// then the other) two matching treats to merge them into the next one up the
// chain; serve each regular's order. Three orders, then free play.
import { APP_STORE, ART, CHAIN, COLS, ORDERS, OVEN, PLAY_STORE, STOCK_CELLS, startBoard } from '../lib/bakery';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const TOP = CHAIN.length;

for (const root of document.querySelectorAll<HTMLElement>('[data-bakery]')) play(root);

function play(root: HTMLElement) {
  const cells = [...root.querySelectorAll<HTMLButtonElement>('.cell')];
  const orderEl = root.querySelector<HTMLElement>('[data-order]')!;
  const serveBtn = orderEl.querySelector<HTMLButtonElement>('.fbt-serve')!;
  const coinsEl = root.querySelector<HTMLElement>('[data-coins]')!;
  const hint = root.querySelector<HTMLElement>('[data-hint]')!;
  const sayEl = root.querySelector<HTMLElement>('[data-say]')!;

  let board = startBoard();
  let order = 0;
  let coins = 0;
  let best = Math.max(...board);
  let selected: number | null = null;
  let hinted = false;
  let serving = false;

  const say = (text: string) => { sayEl.textContent = ''; requestAnimationFrame(() => (sayEl.textContent = text)); };
  const img = (src: string) => `<img src="${src}" alt="" width="108" height="108" draggable="false" />`;

  function draw(i: number, fx?: string) {
    const t = board[i];
    const c = cells[i];
    c.classList.toggle('oven', t === -1);
    c.classList.toggle('sel', selected === i);
    c.innerHTML = t === -1 ? img(`${ART}/oven.webp`) : t ? img(`${ART}/item-${t}.webp`) : '';
    c.setAttribute('aria-label', t === -1 ? 'Bread box: tap for an egg' : t ? `${CHAIN[t - 1]}${selected === i ? ', picked up' : ''}` : 'Empty');
    if (fx && !reduced) { c.classList.remove(fx); void c.offsetWidth; c.classList.add(fx); }
  }
  const drawAll = () => board.forEach((_, i) => draw(i));

  function syncOrder() {
    const o = ORDERS[order];
    const ready = !!o && board.includes(o.tier);
    serveBtn.disabled = serving || (!!o && !ready);
    orderEl.classList.toggle('ready', ready);
  }

  function setOrder() {
    const o = ORDERS[order];
    const who = orderEl.querySelector<HTMLImageElement>('.fbt-who')!;
    const p = orderEl.querySelector('.fbt-say p')!;
    const want = orderEl.querySelector<HTMLElement>('.fbt-want')!;
    if (o) {
      who.src = `${ART}/${o.who}.webp`;
      p.textContent = o.say;
      want.hidden = false;
      want.innerHTML = `<img src="${ART}/item-${o.tier}.webp" alt="" width="34" height="34" /><b>${CHAIN[o.tier - 1]}</b>`;
      serveBtn.textContent = 'Serve';
      say(`New order: ${CHAIN[o.tier - 1]}.`);
    } else {
      who.src = `${ART}/cat-loaf.webp`;
      p.textContent = "That's the morning rush! Keep merging, or start over.";
      want.hidden = true;
      serveBtn.textContent = 'Start over';
      hint.innerHTML = `The full café has 100+ treats, five chapters and a family story. <a href="${APP_STORE}" target="_blank" rel="noreferrer">App Store</a> · <a href="${PLAY_STORE}" target="_blank" rel="noreferrer">Google Play</a>`;
      root.classList.add('done');
      say('All orders served.');
    }
    if (!reduced) { orderEl.classList.remove('in'); void orderEl.offsetWidth; orderEl.classList.add('in'); }
    syncOrder();
  }

  function restock(tiers: number[]) {
    let k = 0;
    for (const t of tiers) {
      while (k < STOCK_CELLS.length && board[STOCK_CELLS[k]] !== 0) k++;
      const i = k < STOCK_CELLS.length ? STOCK_CELLS[k] : board.indexOf(0);
      if (i < 0) return;
      board[i] = t;
      draw(i, 'pop');
    }
  }

  function serve(from?: number) {
    const o = ORDERS[order];
    if (!o) { // Start over
      board = startBoard(); order = 0; coins = 0; coinsEl.textContent = '0'; selected = null;
      root.classList.remove('done');
      hint.textContent = 'Tap the bread box for an egg, then drag two matches together.';
      drawAll(); setOrder();
      return;
    }
    const i = from != null && board[from] === o.tier ? from : board.indexOf(o.tier);
    if (i < 0 || serving) return;
    serving = true;
    serveBtn.disabled = true;
    board[i] = 0;
    if (selected === i) selected = null;
    draw(i);
    fly(cells[i], orderEl.querySelector('.fbt-want img'), `${ART}/item-${o.tier}.webp`);
    coins += o.coins;
    coinsEl.textContent = String(coins);
    coinsEl.parentElement!.classList.remove('bump'); void coinsEl.offsetWidth; coinsEl.parentElement!.classList.add('bump');
    orderEl.classList.add('served');
    say(`Served the ${CHAIN[o.tier - 1].toLowerCase()}. ${coins} coins.`);
    setTimeout(() => {
      orderEl.classList.remove('served');
      serving = false;
      order++;
      setOrder();
      const next = ORDERS[order];
      if (next) restock(next.stock);
      syncOrder();
    }, reduced ? 0 : 650);
  }

  function spawn() {
    const free = board.map((t, i) => (t === 0 ? i : -1)).filter((i) => i >= 0);
    if (!free.length) {
      draw(OVEN, 'shake');
      say('No room on the tray. Merge something first.');
      return;
    }
    // The closest free cell to the bread box.
    const dist = (i: number) => Math.abs((i % COLS) - (OVEN % COLS)) + Math.abs(Math.floor(i / COLS) - Math.floor(OVEN / COLS));
    const i = free.sort((a, b) => dist(a) - dist(b))[0];
    board[i] = 1;
    draw(OVEN, 'press');
    fly(cells[OVEN], cells[i], `${ART}/item-1.webp`, () => draw(i, 'pop'));
    if (reduced) draw(i);
    if (!hinted) { hinted = true; hint.textContent = 'Now drag the two eggs together.'; }
    say('An egg.');
    syncOrder();
  }

  /** Move, merge or swap a treat from cell a onto cell b. */
  function drop(a: number, b: number) {
    const ta = board[a];
    const tb = board[b];
    if (a === b || ta <= 0 || tb === -1) return false;
    if (tb === ta && ta < TOP) {
      board[a] = 0;
      board[b] = ta + 1;
      selected = null;
      draw(a); draw(b, 'merge');
      sparkle(cells[b]);
      const name = CHAIN[ta];
      if (ta + 1 > best) {
        best = ta + 1;
        if (best > 5) hint.textContent = `New treat: ${name}! ${best < TOP ? 'Keep going.' : "That's the top of the chain."}`;
      }
      if (hinted && hint.textContent?.startsWith('Now drag')) hint.textContent = 'Keep merging up to what the regular ordered.';
      say(`Merged into ${name.toLowerCase()}.`);
    } else {
      [board[a], board[b]] = [tb, ta];
      selected = null;
      draw(a); draw(b);
      if (tb === ta) say(`${CHAIN[ta - 1]} is already the top of the chain.`);
    }
    syncOrder();
    return true;
  }

  function tap(i: number) {
    if (board[i] === -1) { spawn(); return; }
    if (selected == null) {
      if (board[i] > 0) { selected = i; draw(i); say(`Picked up ${CHAIN[board[i] - 1].toLowerCase()}. Tap a match to merge.`); }
      return;
    }
    const s = selected;
    if (s === i) { selected = null; draw(i); return; }
    selected = null;
    draw(s);
    drop(s, i);
  }

  /* ---------- Input: taps and keyboard via click, drags via pointer events ---------- */
  let drag: { i: number; id: number; x: number; y: number; ghost?: HTMLImageElement } | null = null;
  let swallowClick = false;

  cells.forEach((c, i) => c.addEventListener('click', () => {
    if (swallowClick) { swallowClick = false; return; }
    tap(i);
  }));
  serveBtn.addEventListener('click', () => serve());

  root.addEventListener('pointerdown', (e) => {
    const c = (e.target as Element).closest<HTMLButtonElement>('.cell');
    if (!c || e.button !== 0) return;
    const i = Number(c.dataset.i);
    if (board[i] <= 0) return;
    drag = { i, id: e.pointerId, x: e.clientX, y: e.clientY };
  });
  root.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.ghost) {
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
      const g = document.createElement('img');
      g.src = `${ART}/item-${board[drag.i]}.webp`;
      g.className = 'fbt-ghost';
      document.body.append(g);
      drag.ghost = g;
      cells[drag.i].classList.add('lift');
      cells.forEach((c, j) => c.classList.toggle('match', j !== drag!.i && board[j] === board[drag!.i] && board[j] < TOP));
      if (selected != null) { const s = selected; selected = null; draw(s); }
      root.setPointerCapture(e.pointerId);
    }
    drag.ghost.style.transform = `translate(${e.clientX}px, ${e.clientY}px) translate(-50%, -50%)`;
    const over = document.elementFromPoint(e.clientX, e.clientY);
    cells.forEach((c) => c.classList.toggle('over', c === over?.closest('.cell')));
    orderEl.classList.toggle('over', !!over?.closest('[data-order]'));
  });
  const end = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    const { i, ghost } = drag;
    drag = null;
    if (!ghost) return;
    swallowClick = true;
    setTimeout(() => (swallowClick = false), 0);
    ghost.remove();
    cells.forEach((c) => c.classList.remove('lift', 'match', 'over'));
    orderEl.classList.remove('over');
    if (e.type === 'pointercancel') return;
    const over = document.elementFromPoint(e.clientX, e.clientY);
    const cell = over?.closest<HTMLButtonElement>('.cell');
    if (over?.closest('[data-order]') && ORDERS[order]?.tier === board[i]) serve(i);
    else if (cell && root.contains(cell)) drop(i, Number(cell.dataset.i));
  };
  root.addEventListener('pointerup', end);
  root.addEventListener('pointercancel', end);
  root.addEventListener('lostpointercapture', (e) => { if (drag?.ghost) end(e); });
  // Touch drags on the board shouldn't scroll the page.
  root.querySelector('.fbt-board')!.addEventListener('touchmove', (e) => { if (drag?.ghost) e.preventDefault(); }, { passive: false });
}

/** Flies a copy of a treat from one element to another. */
function fly(from: Element, to: Element | null, src: string, done?: () => void) {
  if (reduced || !to) { done?.(); return; }
  const a = from.getBoundingClientRect();
  const b = to.getBoundingClientRect();
  const g = document.createElement('img');
  g.src = src;
  g.className = 'fbt-fly';
  g.style.cssText = `left:${a.left + a.width / 2}px;top:${a.top + a.height / 2}px`;
  document.body.append(g);
  g.animate(
    [
      { transform: 'translate(-50%, -50%) scale(.5)', opacity: 0.6 },
      { transform: `translate(calc(-50% + ${(b.left - a.left) / 2}px), calc(-50% + ${(b.top - a.top) / 2 - 40}px)) scale(1.1)`, opacity: 1, offset: 0.55 },
      { transform: `translate(calc(-50% + ${b.left + b.width / 2 - a.left - a.width / 2}px), calc(-50% + ${b.top + b.height / 2 - a.top - a.height / 2}px)) scale(.9)`, opacity: 1 },
    ],
    { duration: 380, easing: 'cubic-bezier(.3,.7,.3,1)' },
  ).finished.then(() => { g.remove(); done?.(); });
}

function sparkle(cell: Element) {
  if (reduced) return;
  for (let k = 0; k < 6; k++) {
    const s = document.createElement('i');
    s.className = 'spark';
    s.style.setProperty('--a', `${k * 60 + Math.random() * 30}deg`);
    cell.append(s);
    setTimeout(() => s.remove(), 600);
  }
}
