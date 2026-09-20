// Categorical colours validated on the dark surface (#101823), shared by the
// charts and the table badges so a praxis type looks the same everywhere.
export const TYPE_COLORS: Record<string, string> = {
  adult: '#3d87e0',
  child: '#c98500',
  mixed: '#17a08c',
  school: '#9085e9',
};

export const KIND_LINE = { dental: '#17a08c', gp: '#3d87e0' } as const;

/** NEAK service types outside the district map — keyed by NEAK's own labels,
 *  unknown types fall back to SERVICE_TYPE_FALLBACK */
export const SERVICE_TYPE_COLORS: Record<string, string> = {
  'Ügyelet': '#ff7a59',
  'Egyetemi alapellátás': '#9085e9',
  'Szájsebészet': '#3d87e0',
  'Fogszabályozás': '#17a08c',
  'Röntgen': '#c98500',
  'Parodontológia': '#e05b8a',
  'Gyermek szakellátás': '#4fd6c2',
  'Egyetemi szakellátás': '#9085e9',
  'Fogyatékkal élő gyermekek szakellátása': '#6ea8ff',
  'Fogyatékkal élő felnőttek szakellátása': '#b8b0f5',
};
export const SERVICE_TYPE_FALLBACK = '#9aa8bb';

export function serviceTypeColor(type: string): string {
  return SERVICE_TYPE_COLORS[type] ?? SERVICE_TYPE_FALLBACK;
}
