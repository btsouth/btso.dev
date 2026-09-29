// Layout of the homepage activity grid, shared by the hero canvas and the page,
// which reserves the grid's height in CSS so the text below doesn't jump.

/** The days the grid shows (whole weeks, trimmed to the active stretch) and its column count. */
export function gridDays(days: [string, number][], narrow: boolean) {
  const firstActive = days.findIndex(([, c]) => c > 0);
  const activeWeeks = Math.ceil((days.length - Math.max(0, firstActive)) / 7) + 1;
  const weeks = Math.max(16, Math.min(narrow ? 20 : 53, activeWeeks));
  const shown = days.slice(-weeks * 7);
  const firstDow = new Date(`${shown[0][0]}T12:00:00`).getDay();
  return { shown, firstDow, cols: Math.ceil((shown.length + firstDow) / 7) };
}

/** Square pitch in px for a hero this wide. Narrow means under 700px. */
export const gridPitch = (width: number, cols: number) => Math.max(6, Math.min(30, Math.floor((Math.min(width, 1100) - 32) / cols)));
