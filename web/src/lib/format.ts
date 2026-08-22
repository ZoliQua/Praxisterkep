const nf = new Intl.NumberFormat('hu-HU');

export function formatNumber(n: number): string {
  return nf.format(n);
}

export function formatPercent(ratio: number, decimals = 1): string {
  return `${(ratio * 100).toFixed(decimals).replace('.', ',')}%`;
}

const HU_MONTH_NAMES = [
  'január', 'február', 'március', 'április', 'május', 'június',
  'július', 'augusztus', 'szeptember', 'október', 'november', 'december',
];

/** '2026-08' -> '2026. augusztus' */
export function formatMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${y}. ${HU_MONTH_NAMES[m - 1]}`;
}

/** Whole months elapsed from `since` (YYYY-MM) to `until` (YYYY-MM). */
export function monthsBetween(since: string, until: string): number {
  const [sy, sm] = since.split('-').map(Number);
  const [uy, um] = until.split('-').map(Number);
  return (uy - sy) * 12 + (um - sm);
}

/** 27 -> '2 év 3 hónap', 8 -> '8 hónap' */
export function formatDuration(months: number): string {
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (y === 0) return `${m} hónap`;
  if (m === 0) return `${y} év`;
  return `${y} év ${m} hónap`;
}
