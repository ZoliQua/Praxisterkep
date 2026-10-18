// How much of an association survives each control, as three bars.
//
// Raw r first, then with income held still, then with income and education
// held still together. A bar that shrinks to nothing says the first number
// was mostly the controls talking; one that stays says something is left.
// A faded bar is not distinguishable from chance (p ≥ 0.05).
import { t } from '../../lib/i18n';
import { formatDecimal } from '../../lib/format';

export interface Step { key: string; r: number; p: number }

export function PartialSteps({ steps }: { steps: Step[] }) {
  const max = Math.max(0.6, ...steps.map((s) => Math.abs(s.r)));
  return (
    <div className="partial-steps" role="list">
      {steps.map((s) => (
        <div key={s.key} className={`partial-steps__row${s.p < 0.05 ? '' : ' is-weak'}`} role="listitem">
          <span className="partial-steps__label">{t(`outcomes.steps.${s.key}`)}</span>
          <span className="partial-steps__track">
            <i className={s.r < 0 ? 'is-neg' : ''} style={{ width: `${(Math.abs(s.r) / max) * 100}%` }} />
          </span>
          <b>{formatDecimal(s.r.toFixed(2))}</b>
        </div>
      ))}
    </div>
  );
}
