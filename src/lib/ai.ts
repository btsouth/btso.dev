// Shared bits for the AI pages (/stats and /bench): model colors and number formats.
// Model colors are fixed per model, like project colors, and go through --pc so light
// themes darken them (--pci) wherever they draw text or thin marks.

const COLORS: [RegExp, string][] = [
  [/^opus/i, '#d97757'],
  [/^fable/i, '#b48cf0'],
  [/^sonnet/i, '#e5a54b'],
  [/^haiku/i, '#e9c46a'],
  [/^sol 6\.1/i, '#5b9cf5'],
  [/^sol 6/i, '#3f74d9'],
  [/^sol/i, '#8fb8f7'],
  [/^terra/i, '#b7d65a'],
  [/^astra/i, '#3ccf91'],
  [/^deepseek/i, '#2bbfd4'],
  [/^glm/i, '#e8719a'],
  [/^kimi/i, '#9d8cf0'],
  [/^grok/i, '#a8a29e'],
  [/^gpt/i, '#7fb3a4'],
];

export const OTHER = '#8a8479';

export function modelColor(name: string) {
  return COLORS.find(([re]) => re.test(name))?.[1] ?? OTHER;
}

/** 55_710_068_969 -> "55.7B", 912_000_000 -> "912M". */
export function short(n: number) {
  const units: [number, string][] = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
  for (const [size, unit] of units) {
    if (n >= size) {
      const v = n / size;
      return `${v >= 100 ? Math.round(v) : v.toFixed(1).replace(/\.0$/, '')}${unit}`;
    }
  }
  return String(Math.round(n));
}

export const money = (n: number) =>
  n >= 1000 ? `$${Math.round(n).toLocaleString('en-US')}` : `$${n.toFixed(n < 10 ? 2 : 0)}`;

export const secs = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}m ${String(Math.round(s % 60)).padStart(2, '0')}s` : `${Math.round(s)}s`);

export const dayLabel = (iso: string, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', opts);

const LABELS: Record<string, string> = {
  'claude-opus-5-5': 'Opus 5.5', 'claude-fable-5-1': 'Fable 5.1', 'claude-sonnet-5-5': 'Sonnet 5.5', 'claude-haiku-5-5': 'Haiku 5.5', 'gpt-6.1-sol': 'Sol 6.1', 'gpt-6.1-terra': 'Terra 6.1', 'gpt-6-astra': 'Astra',
  'opencode-go/deepseek-v4.1-flash': 'DeepSeek V4.1 Flash',
};
/** A bench model id as a name: "claude-opus-5-5" -> "Opus 5.5". */
export const modelLabel = (id: string) => LABELS[id] ?? id.split('/').pop()!;

export const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0;
};
