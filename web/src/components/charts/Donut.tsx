// A ring of parts with something written in the middle. Used wherever a share
// is the point and the absolute number is the context — "how many of the
// county's settlements", "how many of its districts".
import type { ReactNode } from 'react';
import { formatNumber, formatPercent } from '../../lib/format';

export interface Slice { value: number; color: string; label: string }

export function Donut({
  slices, size = 150, thickness = 20, children, active, onActive, onPick,
}: {
  slices: readonly Slice[];
  size?: number;
  thickness?: number;
  children?: ReactNode;
  /** the slice the card is currently showing, if any */
  active?: string | null;
  onActive?: (label: string | null) => void;
  /** a click on a slice: the page narrows to what that slice counts */
  onPick?: (label: string) => void;
}) {
  const total = slices.reduce((a, s) => a + s.value, 0);
  const r = size / 2 - thickness / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="donut" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden="true"
        onPointerLeave={() => onActive?.(null)}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke="var(--line)" strokeWidth={thickness} />
        {total > 0 && slices.map((s) => {
          const len = (s.value / total) * c;
          const dash = `${len} ${c - len}`;
          const node = (
            <circle key={s.label} cx={size / 2} cy={size / 2} r={r} fill="none"
              stroke={s.color} strokeWidth={thickness} strokeDasharray={dash}
              strokeDashoffset={-offset}
              opacity={!active || active === s.label ? 1 : 0.3}
              className={onPick ? 'is-clickable' : undefined}
              onPointerEnter={() => onActive?.(s.label)}
              onClick={onPick ? () => onPick(s.label) : undefined}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}>
              <title>{s.label}</title>
            </circle>
          );
          offset += len;
          return node;
        })}
      </svg>
      {children && <div className="donut__center">{children}</div>}
    </div>
  );
}

/**
 * The key beside a ring.
 *
 * A ring without one is a decoration: three colours and no way to tell which
 * is which without hovering every arc in turn. The rows answer to the pointer
 * the way the arcs do, so either half of the chart can drive the other.
 */
export function DonutLegend({ slices, active, onActive, onPick }: {
  slices: readonly Slice[];
  active?: string | null;
  onActive?: (label: string | null) => void;
  onPick?: (label: string) => void;
}) {
  const total = slices.reduce((a, s) => a + s.value, 0);
  return (
    <ul className="agelegend donut-legend" onPointerLeave={() => onActive?.(null)}>
      {slices.filter((s) => s.value > 0).map((s) => (
        <li key={s.label} className={active === s.label ? 'is-on' : undefined}
          onPointerEnter={() => onActive?.(s.label)}
          onFocus={() => onActive?.(s.label)}
          onClick={onPick ? () => onPick(s.label) : undefined}
          tabIndex={onActive ? 0 : undefined}>
          <i style={{ background: s.color }} />
          <span className="agelegend__label">{s.label}</span>
          <strong>{formatNumber(s.value)}</strong>
          <span className="agelegend__count">
            {total ? formatPercent(s.value / total) : ''}
          </span>
        </li>
      ))}
    </ul>
  );
}
