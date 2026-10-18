// Two readings of one measure, side by side for every country: the city and
// the countryside, or the poorest fifth and the richest. The gap is the
// point — a country can look fine on average and fail its villages — so the
// rows are sorted by it, and only a year both ends report is compared.
import { t } from '../../lib/i18n';
import type { PairRow } from '../../lib/europe';

export function EuPairs({ rows, aLabel, bLabel, focus, onFocus, nameOf, format }: {
  rows: PairRow[];
  aLabel: string;
  bLabel: string;
  focus: string;
  onFocus: (geo: string) => void;
  nameOf: (geo: string) => string;
  format: (v: number) => string;
}) {
  const hi = Math.max(...rows.flatMap((r) => [r.a, r.b]), 0.1) * 1.06;
  const x = (v: number) => `${(v / hi) * 100}%`;
  return (
    <div className="eu-pairs">
      <p className="eu-pairs__legend">
        <span><i className="is-a" />{aLabel}</span>
        <span><i className="is-b" />{bLabel}</span>
      </p>
      {rows.map((r) => (
        <button type="button" key={r.geo} onClick={() => onFocus(r.geo)} aria-pressed={r.geo === focus}
          className={`eu-pairs__row${r.geo === focus ? ' is-focus' : ''}${r.geo === 'HU' ? ' is-hu' : ''}`}
          title={t('europe.pairTitle', { name: nameOf(r.geo), a: aLabel, av: format(r.a), b: bLabel,
            bv: format(r.b), year: r.year })}>
          <span className="eu-pairs__name">{nameOf(r.geo)}</span>
          <span className="eu-pairs__track">
            <span className="eu-pairs__bar" style={{ left: x(Math.min(r.a, r.b)), width: `${(Math.abs(r.a - r.b) / hi) * 100}%` }} />
            <i className="is-a" style={{ left: x(r.a) }} />
            <i className="is-b" style={{ left: x(r.b) }} />
          </span>
          <b>{format(r.a)} · {format(r.b)}</b>
        </button>
      ))}
    </div>
  );
}
