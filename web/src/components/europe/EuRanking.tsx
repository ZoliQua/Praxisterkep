// The chosen countries, best first, each at its own latest year.
//
// A bar for every country, the EU line across them, the country in focus
// lit. The year is written next to a value only where it differs from the
// newest one — so the eye catches the country that answers for 2019 among
// those that answer for 2024 — and a value far older than the rest is set
// apart and left unranked rather than compared with figures it cannot meet.
import { t } from '../../lib/i18n';
import { newestYear, type EuIndicator, type RankRow } from '../../lib/europe';

export function EuRanking({ ind, rows, members, focus, onFocus, nameOf, format, refValue, refLabel }: {
  ind: EuIndicator;
  rows: RankRow[];
  members: string[];
  focus: string;
  onFocus: (geo: string) => void;
  nameOf: (geo: string) => string;
  format: (v: number) => string;
  refValue: number | null;
  refLabel: string;
}) {
  const newest = newestYear(ind, members);
  const hi = Math.max(...rows.map((r) => r.value), refValue ?? 0) * 1.06 || 1;
  const x = (v: number) => `${(v / hi) * 100}%`;
  const missing = members.filter((g) => !rows.some((r) => r.geo === g));
  return (
    <div className="eu-rank">
      <ol>
        {rows.map((r, i) => (
          <li key={r.geo}
            className={`eu-rank__row${r.geo === focus ? ' is-focus' : ''}${r.geo === 'HU' ? ' is-hu' : ''}${r.stale ? ' is-stale' : ''}${i > 0 && r.stale && !rows[i - 1].stale ? ' is-break' : ''}`}>
            <button type="button" onClick={() => onFocus(r.geo)} aria-pressed={r.geo === focus}>
              <span className="eu-rank__pos">{r.rank ?? '–'}</span>
              <span className="eu-rank__name">{nameOf(r.geo)}
                {r.oecd && <sup className="eu-rank__oecd" title={t('europe.oecdMarkTitle')}>{t('europe.oecdMark')}</sup>}
              </span>
              <span className="eu-rank__track">
                <i style={{ width: x(r.value) }} />
                {refValue !== null && <em style={{ left: x(refValue) }} title={refLabel} />}
              </span>
              <b>{format(r.value)}</b>
              <small>{r.stale ? t('europe.staleYear', { year: r.year }) : r.year !== newest ? r.year : ''}</small>
            </button>
          </li>
        ))}
      </ol>
      <p className="eu-rank__legend">
        <span><em />{refLabel}</span>
        {missing.length > 0 && (
          <span>{t('europe.missing', { list: missing.map(nameOf).join(', ') })}</span>
        )}
      </p>
    </div>
  );
}
