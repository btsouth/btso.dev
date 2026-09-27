// Omarchy themes for the whole site. T (Shift+T backwards) cycles; the menu picks.
export const THEMES = ['btso', 'tokyo-night', 'catppuccin', 'gruvbox', 'osaka-jade', 'matte-black', 'rose-pine', 'paper'];

const root = document.documentElement;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const btn = document.getElementById('themeBtn');
const menu = document.getElementById('themeMenu');

type Listener = () => void;
const listeners = new Set<Listener>();
/** Canvas code that caches colors re-reads them after a theme change. */
export const onThemeChange = (fn: Listener) => { listeners.add(fn); return () => listeners.delete(fn); };

function syncChrome() {
  const cur = root.dataset.theme ?? 'btso';
  const name = document.getElementById('themeName');
  if (name) name.textContent = cur;
  const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg);
  if (menu) {
    menu.innerHTML =
      THEMES.map((t) => `<button type="button" role="menuitem" data-theme-pick="${t}" class="${t === cur ? 'on' : ''}"><span class="swatches" data-theme="${t}"><i style="background:var(--bg);outline:1px solid var(--line)"></i><i style="background:var(--accent)"></i><i style="background:var(--accent2)"></i></span>${t}</button>`).join('') +
      '<div class="hint">Press <kbd>T</kbd> anywhere to flip through themes. The Omarchy apps follow your system theme, so the site does too.</div>';
  }
}

export function setTheme(name: string, origin?: Element | null) {
  const apply = () => {
    root.dataset.theme = name;
    try { localStorage.setItem('btso-theme', name); } catch { /* Theme still applies without storage. */ }
    syncChrome();
    listeners.forEach((fn) => fn());
  };
  const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void> } };
  if (!doc.startViewTransition || reduced) return apply();
  const r = (origin ?? btn)?.getBoundingClientRect();
  const x = r ? r.left + r.width / 2 : innerWidth - 60;
  const y = r ? r.top + r.height / 2 : 30;
  const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  doc.startViewTransition(apply).ready.then(() => {
    root.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
      { duration: 650, easing: 'cubic-bezier(.2,.8,.2,1)', pseudoElement: '::view-transition-new(root)' },
    );
  }).catch(() => {});
}

export function toast(html: string) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.innerHTML = html;
  t.classList.add('show');
  clearTimeout(Number(t.dataset.timer));
  t.dataset.timer = String(setTimeout(() => t.classList.remove('show'), 1400));
}

syncChrome();

btn?.addEventListener('click', (e) => {
  e.stopPropagation();
  const open = !menu?.classList.contains('open');
  menu?.classList.toggle('open', open);
  btn.setAttribute('aria-expanded', String(open));
});
menu?.addEventListener('click', (e) => {
  const pick = (e.target as Element).closest<HTMLElement>('[data-theme-pick]');
  if (pick?.dataset.themePick) setTheme(pick.dataset.themePick, pick);
});
document.addEventListener('click', (e) => {
  if (!(e.target as Element).closest?.('#themeMenu')) {
    menu?.classList.remove('open');
    btn?.setAttribute('aria-expanded', 'false');
  }
});
document.addEventListener('keydown', (e) => {
  const target = e.target as Element;
  if (target.closest?.('input, textarea, select, [contenteditable]') || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === 'Escape') { menu?.classList.remove('open'); return; }
  if (e.key !== 't' && e.key !== 'T') return;
  const i = THEMES.indexOf(root.dataset.theme ?? 'btso');
  const next = THEMES[(i + (e.shiftKey ? THEMES.length - 1 : 1)) % THEMES.length];
  setTheme(next);
  toast(`<span class="swatches"><i style="background:var(--accent)"></i><i style="background:var(--accent2)"></i></span> ${next}`);
});
