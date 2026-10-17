// The small figures the járás cards are built from.
//
// A number on its own ("53 783 lakos") tells a reader nothing — is that a big
// járás or a small one? Each of these puts one number against the thing it
// should be read against: the average járás, the capital's total, the
// threshold the state itself set.
import { t } from '../../lib/i18n';
import { formatDecimal, formatNumber } from '../../lib/format';

/**
 * This against the average, as two bars on one scale.
 *
 * The reference bar is drawn under the value, not beside it, so the
 * comparison is a length a reader can see rather than two numbers to divide.
 */
export function CompareBars({ rows }: {
  rows: {
    key: string;
    label: string;
    value: number;
    reference: number;
    referenceLabel: string;
    format: (v: number) => string;
  }[];
}) {
  return (
    <ul className="cmpbars">
      {rows.map((r) => {
        const max = Math.max(r.value, r.reference) || 1;
        const ratio = r.reference ? r.value / r.reference : null;
        return (
          <li key={r.key}>
            <div className="cmpbars__head">
              <span className="cmpbars__label">{r.label}</span>
              <strong>{r.format(r.value)}</strong>
            </div>
            <div className="cmpbars__track">
              <span className="cmpbars__value"
                style={{ width: `${(r.value / max) * 100}%` }} />
              <span className="cmpbars__ref"
                style={{ left: `${(r.reference / max) * 100}%` }} />
            </div>
            <div className="cmpbars__foot">
              <span>{r.referenceLabel}: {r.format(r.reference)}</span>
              {ratio !== null && (
                <span className={ratio >= 1 ? 'is-more' : 'is-less'}>
                  {t(ratio >= 1 ? 'district.timesMore' : 'district.timesLess', {
                    n: formatDecimal((ratio >= 1 ? ratio : 1 / ratio).toFixed(1)),
                  })}
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * One value on a scale, with the line the state drew on it.
 *
 * The complex indicator means nothing as a bare number: 45.59 is only
 * readable against the range it lives in and against 46.68, the threshold
 * below which a járás counts as a beneficiary one.
 */
export function ScaleMark({ value, lo, hi, threshold, thresholdLabel, format }: {
  value: number; lo: number; hi: number;
  threshold?: number | null; thresholdLabel?: string;
  format: (v: number) => string;
}) {
  const span = hi - lo || 1;
  const at = (v: number) => `${Math.max(0, Math.min(1, (v - lo) / span)) * 100}%`;
  return (
    <div className="scalemark">
      <div className="scalemark__track">
        <span className="scalemark__fill" style={{ width: at(value) }} />
        {threshold != null && (
          <span className="scalemark__threshold" style={{ left: at(threshold) }} />
        )}
        <span className="scalemark__pin" style={{ left: at(value) }} />
      </div>
      <div className="scalemark__ends">
        <span>{format(lo)}</span>
        {threshold != null && thresholdLabel && (
          <span className="scalemark__thresholdLabel">
            {thresholdLabel}: {format(threshold)}
          </span>
        )}
        <span>{format(hi)}</span>
      </div>
    </div>
  );
}

/**
 * How many of a few dozen things are in some state, as the things themselves.
 *
 * A percentage flattens the difference between "3 of 4 settlements" and
 * "37 of 49"; the dots keep it, and a járás of forty villages looks like a
 * járás of forty villages.
 */
export function ShareDots({ total, marked, title, max = 120 }: {
  total: number; marked: number; title?: string; max?: number;
}) {
  if (!total || total > max) return null;
  return (
    <span className="sharedots" title={title}
      aria-label={`${formatNumber(marked)} / ${formatNumber(total)}`}>
      {Array.from({ length: total }, (_, i) => (
        <i key={i} className={i < marked ? 'is-on' : undefined} />
      ))}
    </span>
  );
}
