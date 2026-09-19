import { locale } from './i18n';

const nf = new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'hu-HU');

export function formatNumber(n: number): string {
  return nf.format(n);
}

export function formatPercent(ratio: number, decimals = 1): string {
  const text = (ratio * 100).toFixed(decimals);
  return `${locale === 'en' ? text : text.replace('.', ',')}%`;
}

const HU_MONTH_NAMES = [
  'január', 'február', 'március', 'április', 'május', 'június',
  'július', 'augusztus', 'szeptember', 'október', 'november', 'december',
];
const EN_MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** '2026-08' -> '2026. augusztus' | 'August 2026' */
export function formatMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return locale === 'en'
    ? `${EN_MONTH_NAMES[m - 1]} ${y}`
    : `${y}. ${HU_MONTH_NAMES[m - 1]}`;
}

/** Whole months elapsed from `since` (YYYY-MM) to `until` (YYYY-MM). */
export function monthsBetween(since: string, until: string): number {
  const [sy, sm] = since.split('-').map(Number);
  const [uy, um] = until.split('-').map(Number);
  return (uy - sy) * 12 + (um - sm);
}

/** 27 -> '2 év 3 hónap' | '2 yrs 3 mo', 8 -> '8 hónap' | '8 mo' */
export function formatDuration(months: number): string {
  const y = Math.floor(months / 12);
  const m = months % 12;
  const yUnit = locale === 'en' ? (y === 1 ? 'yr' : 'yrs') : 'év';
  const mUnit = locale === 'en' ? 'mo' : 'hónap';
  if (y === 0) return `${m} ${mUnit}`;
  if (m === 0) return `${y} ${yUnit}`;
  return `${y} ${yUnit} ${m} ${mUnit}`;
}

/** locale-aware decimal separator for plain numbers like 2.91 */
export function formatDecimal(n: number | string): string {
  const text = String(n);
  return locale === 'en' ? text : text.replace('.', ',');
}
