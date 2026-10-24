// Categorical colours, as CSS variables of the colour scheme (theme.css), shared by the
// charts and the table badges so a praxis type looks the same everywhere.
export const TYPE_COLORS: Record<string, string> = {
  adult: 'var(--type-adult)',
  child: 'var(--type-child)',
  mixed: 'var(--type-mixed)',
  school: 'var(--type-school)',
};

export const KIND_LINE = { dental: 'var(--type-mixed)', gp: 'var(--type-adult)' } as const;

/** NEAK service types outside the district map — keyed by NEAK's own labels,
 *  unknown types fall back to SERVICE_TYPE_FALLBACK */
export const SERVICE_TYPE_COLORS: Record<string, string> = {
  'Ügyelet': 'var(--alert)',
  'Egyetemi alapellátás': 'var(--violet)',
  'Szájsebészet': 'var(--type-adult)',
  'Fogszabályozás': 'var(--type-mixed)',
  'Röntgen': 'var(--mid)',
  'Parodontológia': 'var(--pink)',
  'Gyermek szakellátás': 'var(--good)',
  'Egyetemi szakellátás': 'var(--violet)',
  'Fogyatékkal élő gyermekek szakellátása': 'var(--gp)',
  'Fogyatékkal élő felnőttek szakellátása': 'var(--violet-soft)',
};
export const SERVICE_TYPE_FALLBACK = 'var(--ink-dim)';

export function serviceTypeColor(type: string): string {
  return SERVICE_TYPE_COLORS[type] ?? SERVICE_TYPE_FALLBACK;
}
