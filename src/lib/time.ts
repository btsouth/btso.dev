/** "3h ago" style relative time. Shared by build-time rendering and the browser. */
export function ago(iso: string | number, now = Date.now()) {
  const s = (now - new Date(iso).getTime()) / 1000;
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  const d = Math.round(s / 86400);
  if (d === 1) return 'yesterday';
  if (d < 30) return `${d}d ago`;
  return `${Math.round(d / 30)}mo ago`;
}
