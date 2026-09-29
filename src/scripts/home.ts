import { createHero, type HeroData } from './hero';
import { presenceText, startLiveFeed, type Activity } from './live';
import { countUp, lastSeen } from './ui';
import { ago } from '../lib/time';
import { THEMES, setTheme } from './theme';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const restart = (el: Element | null, cls: string) => { if (!el) return; el.classList.remove(cls); void (el as HTMLElement).offsetWidth; el.classList.add(cls); };
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/* ---------- Hero ---------- */
const heroEl = document.getElementById('hero');
const dataEl = document.getElementById('heroData');
if (heroEl && dataEl) {
  let latest: { a: Activity; at: string } | null = null;
  const data = JSON.parse(dataEl.textContent ?? '{}') as HeroData & { repos: Record<string, { name: string; version: string | null }>; releases30: number; stars: number; apps: [string, string][] };
  // What the courier says when clicked, one line per click.
  const say = (n: number) => [
    `hey, thanks for stopping by. i carry tyler's github activity here as it happens.${latest ? ` last delivery: ${latest.a.text}, ${ago(latest.at)}.` : ''}`,
    'press T to change the theme. there are 8.',
    'click the grid. it has a few words for you.',
    `${data.releases30} releases in the last 30 days. i'm tired.`,
    'the terminal further down takes commands. try help.',
    'ok, back to work.',
  ][n % 6];
  const hero = createHero(heroEl, data, lastSeen(), {
    say,
    // After the easter-egg explosion, the stats count themselves back up.
    onOverload: (phase) => {
      if (phase === 'rebuilt') document.querySelectorAll<HTMLElement>('.stats [data-count]').forEach((el) => countUp(el));
    },
  });

  document.querySelectorAll<HTMLElement>('.stats [data-count]').forEach((el) => setTimeout(() => countUp(el), 500));

  const presence = document.getElementById('presence');
  const avatar = document.getElementById('avatar');
  const renderPresence = (animate: boolean) => {
    if (!presence || !latest) return;
    const p = presenceText(latest.a, latest.at);
    avatar?.classList.toggle('active', p.active);
    presence.innerHTML = p.html;
    if (animate) restart(presence, 'swap');
  };
  setInterval(() => renderPresence(false), 30e3);

  const fresh = (a: Activity, at: string) => {
    hero.live(a.text, a.release, () => {
      latest = { a, at };
      renderPresence(true);
      restart(avatar, 'ping');
      const contrib = document.getElementById('contribStat');
      if (contrib && !a.release) {
        contrib.textContent = (Number(contrib.textContent?.replace(/,/g, '')) + 1).toLocaleString('en-US');
        restart(contrib, 'bump');
      }
      const pill = document.querySelector('#pill .pt');
      if (a.release && pill) {
        pill.innerHTML = `<b style="color:var(--fg)">${escapeHtml(a.name)} ${escapeHtml(a.tag ?? '')}</b> shipped just now`;
        restart(pill, 'swap');
      }
    });
  };

  startLiveFeed(data.repos, {
    initial(a, at) { latest = { a, at }; renderPresence(false); },
    fresh,
    status(ok) {
      const el = document.getElementById('liveState');
      el?.classList.toggle('off', !ok);
      if (el) el.title = ok ? 'Checks GitHub for new activity every minute' : 'Could not reach GitHub, retrying';
    },
  });

  // ?demo: press L to fake a push (Shift+L a release) and watch it arrive.
  if (new URLSearchParams(location.search).has('demo')) {
    const names = Object.values(data.repos);
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'l' && e.key !== 'L') return;
      const r = names[Math.floor(Math.random() * names.length)];
      const tag = (r.version ?? 'v0.1.0').replace(/(\d+)(?!.*\d)/, (n) => String(Number(n) + 1));
      fresh(e.shiftKey
        ? { release: true, name: r.name, tag, text: `released ${r.name} ${tag}` }
        : { release: false, name: r.name, text: `pushed to ${r.name}` }, new Date().toISOString());
    });
  }
}

/* ---------- App shelves ---------- */
const tabs = document.getElementById('shelfTabs');
const shelf = document.getElementById('shelf');
if (tabs && shelf) {
  const ind = tabs.querySelector<HTMLElement>('.ind');
  const moveInd = () => {
    const on = tabs.querySelector<HTMLElement>('button.on');
    if (on && ind) { ind.style.left = `${on.offsetLeft}px`; ind.style.width = `${on.offsetWidth}px`; }
  };
  const show = (group: string) => {
    tabs.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
      const on = b.dataset.shelf === group;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', String(on));
    });
    let i = 0;
    shelf.querySelectorAll<HTMLElement>('.acard').forEach((card) => {
      const visible = card.dataset.group === group;
      card.hidden = !visible;
      if (visible) { card.style.animationDelay = `${i++ * 40}ms`; restart(card, 'shelf-in'); }
    });
    moveInd();
  };
  tabs.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLButtonElement>('[data-shelf]');
    if (b?.dataset.shelf) show(b.dataset.shelf);
  });
  show(tabs.querySelector<HTMLButtonElement>('button.on')?.dataset.shelf ?? 'omarchy');
  addEventListener('resize', moveInd);
}

/* ---------- Momentum terminal: types itself out, then takes commands ---------- */
// Every line is laid out from the start and only made visible as it "types",
// so the terminal and the tiles beside it keep their size.
const term = document.getElementById('term');
if (term) term.innerHTML = term.innerHTML.split('\n').map((l) => `<span class="tline${reduced ? '' : ' hidden'}">${l}</span>`).join('\n');
if (term && !reduced) {
  const lines = [...term.querySelectorAll('.tline')];
  term.addEventListener('reveal', () => {
    let i = 0;
    const tick = () => { lines[i++]?.classList.remove('hidden'); if (i < lines.length) setTimeout(tick, i < 2 ? 260 : 70); };
    tick();
  }, { once: true });
}
const termIn = document.getElementById('termIn') as HTMLInputElement | null;
if (term && termIn && dataEl) {
  const { apps, stars } = JSON.parse(dataEl.textContent ?? '{}') as { apps: [string, string][]; stars: number };
  const prompt = termIn.closest('.tline')!;
  const history: string[] = [];
  let back = 0;
  const fit = () => { termIn.style.width = `${Math.max(1, termIn.value.length)}ch`; };
  const print = (text: string, cls = 'out') => {
    const line = document.createElement('span');
    line.className = cls;
    line.textContent = text;
    term.insertBefore(line, prompt);
    term.insertBefore(document.createTextNode('\n'), prompt);
  };
  const find = (q: string) => apps.find(([id, name]) => id === q || name.toLowerCase() === q);
  const commands: Record<string, (args: string[]) => string | void> = {
    help: () => 'whoami  ls  open <app>  theme [name]  stars  ship  clear',
    whoami: () => 'tyler south. i make omarchy apps, windows utilities and tools for ai agents.',
    ls: () => apps.map(([id]) => id).join('  '),
    stars: () => `${stars.toLocaleString('en-US')} stars across ${apps.length} repos. thank you.`,
    ship: () => { setTimeout(() => (location.href = '/ship'), 400); return 'opening the ship log...'; },
    open: ([q = '']) => {
      const app = find(q.toLowerCase());
      if (!app) return q ? `no app called ${q}. try ls.` : 'open what? try ls.';
      setTimeout(() => (location.href = `/p/${app[0]}`), 400);
      return `opening ${app[1]}...`;
    },
    theme: ([name]) => {
      const cur = document.documentElement.dataset.theme ?? 'btso';
      if (!name) return THEMES.map((t) => (t === cur ? `[${t}]` : t)).join('  ');
      if (!THEMES.includes(name)) return `no theme called ${name}. try theme.`;
      setTheme(name, termIn);
      return `theme set to ${name}.`;
    },
    clear: () => { while (prompt.previousSibling) prompt.previousSibling.remove(); },
    sudo: () => 'nice try.',
    rm: () => 'absolutely not.',
    exit: () => { termIn.blur(); return 'logout. (it was nice having you.)'; },
    vim: () => 'you would never get out.',
  };
  term.addEventListener('click', () => { if (!String(getSelection()).trim()) termIn.focus({ preventScroll: true }); });
  termIn.addEventListener('input', fit);
  termIn.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      back = Math.max(0, Math.min(history.length, back + (e.key === 'ArrowUp' ? 1 : -1)));
      termIn.value = back ? history[history.length - back] : '';
      fit();
      return;
    }
    if (e.key === 'Escape') { termIn.blur(); return; }
    if (e.key !== 'Enter') return;
    // Keep the terminal its original size; output scrolls inside it.
    if (!term.style.height) { term.style.height = `${term.offsetHeight}px`; term.style.overflowY = 'auto'; }
    const raw = termIn.value.trim();
    termIn.value = '';
    fit();
    back = 0;
    print(`$ ${raw}`, 'hl');
    if (raw) {
      history.push(raw);
      const [cmd, ...args] = raw.split(/\s+/);
      const key = cmd.toLowerCase();
      const run = Object.hasOwn(commands, key) ? commands[key] : undefined;
      const out = run ? run(args) : `command not found: ${cmd}. try help.`;
      if (out) print(out, run ? 'out' : 'err');
    }
    term.scrollTop = term.scrollHeight;
    term.scrollLeft = 0;
  });
}

/* ---------- Headline: the last word retypes itself ---------- */
const word = document.getElementById('heroWord');
const caret = document.getElementById('heroCaret');
if (word && caret && !reduced) {
  const words = ['computer', 'desktop', 'taskbar', 'phone', 'terminal', 'Linux box', 'Windows PC'];
  let i = 0;
  let visible = true;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(word);
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const cycle = async () => {
    await wait(3200);
    if (!visible || document.hidden) return cycle();
    caret.classList.add('on');
    for (let n = word.textContent!.length; n > 0; n--) { word.textContent = word.textContent!.slice(0, -1); await wait(38); }
    await wait(180);
    const next = words[++i % words.length];
    for (const ch of next) { word.textContent += ch; await wait(72); }
    await wait(250);
    caret.classList.remove('on');
    cycle();
  };
  cycle();
}
