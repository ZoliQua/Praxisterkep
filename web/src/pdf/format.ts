// Number and date formatting in the language of the export, not of the page:
// an English report from a Hungarian page writes 12.5%, not 12,5%.
import type { Lang } from './types';

const tag = (lang: Lang) => (lang === 'en' ? 'en-GB' : 'hu-HU');

export function num(lang: Lang, v: number | null | undefined, digits = 0): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '–';
  return new Intl.NumberFormat(tag(lang), {
    minimumFractionDigits: digits, maximumFractionDigits: digits,
  }).format(v);
}

/** A ratio (0.123) as a percentage ("12,3%" / "12.3%"). */
export function pct(lang: Lang, ratio: number | null | undefined, digits = 1): string {
  if (ratio === null || ratio === undefined || !Number.isFinite(ratio)) return '–';
  return `${num(lang, ratio * 100, digits)}%`;
}

export function signed(lang: Lang, v: number | null | undefined, digits = 1, unit = ''): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '–';
  const sign = v > 0 ? '+' : v < 0 ? '−' : '';
  return `${sign}${num(lang, Math.abs(v), digits)}${unit}`;
}

/** "2026-10" -> "2026. október" / "October 2026". */
export function month(lang: Lang, ym: string | null | undefined): string {
  if (!ym) return '–';
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m) return ym;
  const name = new Intl.DateTimeFormat(tag(lang), { month: 'long', timeZone: 'UTC' })
    .format(new Date(Date.UTC(y, m - 1, 1)));
  return lang === 'en' ? `${name} ${y}` : `${y}. ${name}`;
}

/** Today, as the report's date line writes it. */
export function today(lang: Lang, now = new Date()): string {
  return new Intl.DateTimeFormat(tag(lang), { year: 'numeric', month: 'long', day: 'numeric' })
    .format(now);
}

/** A file-name-safe slug: accents folded, everything else a hyphen. */
export function slugify(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
