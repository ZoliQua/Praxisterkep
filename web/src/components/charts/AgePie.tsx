// The age split of a place as a pie, and the same split held against the
// country's. Two rings beat two percentages: "older than the country" is a
// shape, not a number.
import { t } from '../../lib/i18n';
import { formatNumber, formatPercent } from '../../lib/format';

export interface AgeSplit { young: number; working: number; old: number }

const COLORS = { young: '#4fd6c2', working: '#6ea8ff', old: '#f0b429' } as const;
const ORDER = ['young', 'working', 'old'] as const;

function arc(cx: number, cy: number, r: number, from: number, to: number): string {
  const p = (a: number) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  const [x1, y1] = p(from);
  const [x2, y2] = p(to);
  return `M${cx} ${cy}L${x1.toFixed(2)} ${y1.toFixed(2)}`
    + `A${r} ${r} 0 ${to - from > Math.PI ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}Z`;
}

export function AgePie({ split, size = 128, hole = 0 }: {
  split: AgeSplit; size?: number; hole?: number;
}) {
  const total = split.young + split.working + split.old;
  if (!total) return null;
  const r = size / 2;
  let angle = -Math.PI / 2;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img"
      aria-label={t('age.pieLabel')}>
      {ORDER.map((key) => {
        const share = split[key] / total;
        const from = angle;
        angle += share * Math.PI * 2;
        return (
          <path key={key} d={arc(r, r, r, from, angle)} fill={COLORS[key]}
            stroke="var(--bg)" strokeWidth="1" />
        );
      })}
      {hole > 0 && <circle cx={r} cy={r} r={hole} fill="var(--bg-raised)" />}
    </svg>
  );
}

export function AgeLegend({ split, compare }: {
  split: AgeSplit; compare?: AgeSplit;
}) {
  const total = split.young + split.working + split.old;
  const cTotal = compare ? compare.young + compare.working + compare.old : 0;
  return (
    <ul className="agelegend">
      {ORDER.map((key) => {
        const share = total ? split[key] / total : 0;
        const theirs = cTotal ? compare![key] / cTotal : null;
        const diff = theirs === null ? null : share - theirs;
        return (
          <li key={key}>
            <i style={{ background: COLORS[key] }} />
            <span className="agelegend__label">{t(`age.part.${key}`)}</span>
            <strong>{formatPercent(share)}</strong>
            <span className="agelegend__count">{formatNumber(split[key])}</span>
            {diff !== null && (
              <span className={`agelegend__diff${diff > 0 ? ' is-more' : ''}`}>
                {diff > 0 ? '+' : '−'}{formatPercent(Math.abs(diff))}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
