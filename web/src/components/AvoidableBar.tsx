// The three avoidable-mortality groups of NNGYK as one stacked bar: for the
// járás in the middle of the ranking, and for the one being looked at.
import { t } from '../lib/i18n';
import { formatNumber } from '../lib/format';
import { valueOf, type OutcomeDistrict } from '../lib/outcomes';

/** The three avoidable groups as one stacked bar. */
export function AvoidableBar({ rows, row }: { rows: OutcomeDistrict[]; row: OutcomeDistrict | null }) {
  const parts = ['treatable', 'both', 'preventable'] as const;
  // the járás in the middle of the ranking, named: three medians added up
  // would be a járás that does not exist
  const ranked = rows.filter((r) => !r.capital && r.avoidable !== null)
    .sort((a, b) => (a.avoidable as number) - (b.avoidable as number));
  const mid = ranked[Math.floor(ranked.length / 2)];
  const of = (d: OutcomeDistrict) => Object.fromEntries(parts.map((p) => [p, valueOf(d, p) ?? 0]));
  const lines = [
    ...(mid ? [{ label: t('outcomes.mortality.medianDistrict', { name: mid.name }), vals: of(mid) }] : []),
    ...(row && row !== mid ? [{ label: row.name, vals: of(row) }] : []),
  ];
  const max = Math.max(...lines.map((l) => parts.reduce((a, p) => a + l.vals[p], 0)));
  return (
    <div className="composition">
      {lines.map((l) => (
        <div key={l.label} className="composition__row">
          <span className="composition__label">{l.label}</span>
          <span className="composition__bar">
            {parts.map((p) => (
              <i key={p} className={`composition__part is-${p}`}
                style={{ width: `${(100 * l.vals[p]) / max}%` }}
                title={`${t(`outcomes.measure.${p}`)}: ${formatNumber(Math.round(l.vals[p]))}`} />
            ))}
          </span>
          <b>{formatNumber(Math.round(parts.reduce((a, p) => a + l.vals[p], 0)))}</b>
        </div>
      ))}
      <div className="composition__legend">
        {parts.map((p) => (
          <span key={p}><i className={`composition__part is-${p}`} />{t(`outcomes.part.${p}`)}</span>
        ))}
      </div>
    </div>
  );
}
