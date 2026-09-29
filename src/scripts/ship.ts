import './pixel-band';
import { SEEN_KEY, lastSeen, updateNavCount } from './ui';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- Feed: new markers, filters, expanders ---------- */
const feed = document.getElementById('feed');
if (feed) {
  const entries = [...feed.querySelectorAll<HTMLElement>('.entry')];
  const markNew = () => {
    const seen = lastSeen();
    let n = 0;
    for (const e of entries) {
      const isNew = Number(e.dataset.at) > seen;
      e.classList.toggle('new', isNew);
      const tag = e.querySelector<HTMLElement>('.newtag');
      if (tag) tag.hidden = !isNew;
      if (isNew) n++;
    }
    const bar = document.getElementById('newbar');
    const count = document.getElementById('newCount');
    if (bar && count) {
      bar.hidden = n === 0;
      count.innerHTML = `<b>${n} new release${n === 1 ? '' : 's'}</b> since your last visit`;
    }
  };
  markNew();
  document.getElementById('markRead')?.addEventListener('click', () => {
    try { localStorage.setItem(SEEN_KEY, String(Date.now())); } catch { /* Markers just reset next visit. */ }
    // NEW tags in view pop away one after another before the markers clear.
    const inView = [...feed.querySelectorAll<HTMLElement>('.entry.new .newtag')].filter((t) => { const r = t.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; });
    const done = () => { markNew(); updateNavCount(); };
    if (reduced || !inView.length) return done();
    inView.forEach((t, i) => t.animate([{ transform: 'none', opacity: 1 }, { transform: 'scale(1.25)', opacity: 1, offset: 0.35 }, { transform: 'scale(0)', opacity: 0 }], { duration: 320, delay: i * 70, easing: 'ease-in', fill: 'forwards' }));
    setTimeout(done, 320 + inView.length * 70);
  });

  // Relabel today and yesterday in the visitor's time zone.
  const key = (d: Date) => d.toLocaleDateString('en-CA');
  const today = key(new Date()), yesterday = key(new Date(Date.now() - 864e5));
  feed.querySelectorAll<HTMLElement>('.day').forEach((day) => {
    const label = day.querySelector('.dl');
    if (label && day.dataset.day === today) label.textContent = 'Today';
    else if (label && day.dataset.day === yesterday) label.textContent = 'Yesterday';
  });

  let group = 'all';
  let project: string | null = null;
  const apply = () => {
    for (const e of entries) {
      const okGroup = group === 'all' || e.dataset.group === group;
      const okProject = !project || e.dataset.project === project;
      e.hidden = !(okGroup && okProject);
    }
    feed.querySelectorAll<HTMLElement>('.day').forEach((day) => {
      day.hidden = !day.querySelector('.entry:not([hidden])');
    });
  };
  document.getElementById('chips')?.addEventListener('click', (e) => {
    const chip = (e.target as Element).closest<HTMLElement>('[data-f]');
    if (!chip) return;
    group = chip.dataset.f ?? 'all';
    project = null;
    document.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === chip));
    document.querySelectorAll('.side-row').forEach((r) => r.classList.remove('on'));
    apply();
  });
  document.querySelectorAll<HTMLElement>('.side-row').forEach((row) => row.addEventListener('click', () => {
    project = project === row.dataset.fp ? null : row.dataset.fp ?? null;
    group = 'all';
    document.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', (c as HTMLElement).dataset.f === 'all'));
    document.querySelectorAll<HTMLElement>('.side-row').forEach((r) => r.classList.toggle('on', r.dataset.fp === project));
    apply();
    document.querySelector('.ship-layout')?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
  }));
}
