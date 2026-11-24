import lessonsRaw from '../data/chart107-lessons.json';

export const APP_STORE = 'https://apps.apple.com/app/id6838799789';
export const PLAY_STORE = 'https://play.google.com/store/apps/details?id=dev.btso.chart107';
export const ART = '/assets/chart107';
export const SUPPORT_EMAIL = 'support@btso.dev';

export interface WebHotspot {
  id: string;
  title: string;
  badge: string;
  kind: string;
  x: number;
  y: number;
  radius: number;
  floor: string;
  ceiling: string;
  frequency: string | null;
  laancRequired: string;
  summary: string;
  examTrap: string;
}

export interface WebChartLesson {
  id: string;
  slug: string;
  order: number;
  figureId: string;
  figureLabel: string;
  width: number;
  height: number;
  title: string;
  subtitle: string;
  freeTier: boolean;
  keyTakeaway: string;
  hotspots: WebHotspot[];
}

export const CHART107_LESSONS: WebChartLesson[] = lessonsRaw as WebChartLesson[];

export const KIND_COLOR: Record<string, string> = {
  class_b: '#2563EB',
  class_c: '#C026D3',
  class_d: '#38BDF8',
  class_e_sfc: '#E879F9',
  class_e_700: '#D946EF',
  class_g: '#10B981',
  sua: '#EF4444',
  airport: '#38BDF8',
  obstacle: '#F59E0B',
  mtr: '#F97316',
  symbol: '#14B8A6',
};
