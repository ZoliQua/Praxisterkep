// The age split of a place as a pie, and the same split held against the
// country's. Two rings beat two percentages: "older than the country" is a
// shape, not a number.
//
// The slices answer to the pointer: hovering one (or the legend row beside
// it) dims the others and hands the chosen group up to the card, which says
// what it is. A pie that cannot be interrogated is a decoration.
import { useMemo } from 'react';
import { t } from '../../lib/i18n';
import { formatNumber, formatPercent } from '../../lib/format';

export interface AgeSplit { young: number; working: number; old: number }
export type AgeKey = keyof AgeSplit;

export const AGE_COLORS: Record<AgeKey, string> = {
  young: '#4fd6c2', working: '#6ea8ff', old: '#f0b429',
};
const ORDER: AgeKey[] = ['young', 'working', 'old'];

function arc(cx: number, cy: number, r: number, from: number, to: number): string {
  const p = (a: number) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  const [x1, y1] = p(from);
  const [x2, y2] = p(to);
  return `M${cx} ${cy}L${x1.toFixed(2)} ${y1.toFixed(2)}`
    + `A${r} ${r} 0 ${to - from > Math.PI ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}Z`;
}

export function AgePie({ split, size = 150, hole = 0, active, onActive }: {
  split: AgeSplit;
  size?: number;
  hole?: number;
  /** the group the card is currently showing, if any */
  active?: AgeKey | null;
  onActive?: (key: AgeKey | null) => void;
}) {
  const total = split.young + split.working + split.old;
  const r = size / 2;
  // the wedges are worked out once, outside the render body: an accumulator
  // running through a JSX map is the kind of thing that breaks quietly
  const wedges = useMemo(() => {
    const shares = ORDER.map((key) => (total ? split[key] / total : 0));
    // the running start of each wedge, scanned rather than accumulated into
    // a mutable variable
    const starts = shares.reduce<number[]>(
      (acc, share, i) => [...acc, acc[i] + share * Math.PI * 2], [-Math.PI / 2]);
    return ORDER.map((key, i) => ({
      key, share: shares[i], from: starts[i], to: starts[i + 1],
    }));
  }, [split, total]);
  if (!total) return null;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img"
      aria-label={t('age.pieLabel')} className="agepie"
      onPointerLeave={() => onActive?.(null)}>
      {wedges.map(({ key, share, from, to }) => (
        <path key={key} d={arc(r, r, r, from, to)} fill={AGE_COLORS[key]}
          stroke="var(--bg)" strokeWidth="1"
          opacity={!active || active === key ? 1 : 0.32}
          onPointerEnter={() => onActive?.(key)}>
          <title>{`${t(`age.part.${key}`)}: ${formatNumber(split[key])} `
            + `(${formatPercent(share)})`}</title>
        </path>
      ))}
      {hole > 0 && <circle cx={r} cy={r} r={hole} fill="var(--bg-raised)" />}
    </svg>
  );
}

export function AgeLegend({ split, compare, active, onActive }: {
  split: AgeSplit;
  compare?: AgeSplit;
  active?: AgeKey | null;
  onActive?: (key: AgeKey | null) => void;
}) {
  const total = split.young + split.working + split.old;
  const cTotal = compare ? compare.young + compare.working + compare.old : 0;
  return (
    <ul className="agelegend" onPointerLeave={() => onActive?.(null)}>
      {ORDER.map((key) => {
        const share = total ? split[key] / total : 0;
        const theirs = cTotal ? compare![key] / cTotal : null;
        const diff = theirs === null ? null : share - theirs;
        return (
          <li key={key} className={active === key ? 'is-on' : undefined}
            onPointerEnter={() => onActive?.(key)}
            onFocus={() => onActive?.(key)} tabIndex={onActive ? 0 : undefined}>
            <i style={{ background: AGE_COLORS[key] }} />
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
