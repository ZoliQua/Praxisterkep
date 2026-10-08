// A ring of parts with something written in the middle. Used wherever a share
// is the point and the absolute number is the context — "how many of the
// county's settlements", "how many of its districts".
import type { ReactNode } from 'react';

export interface Slice { value: number; color: string; label: string }

export function Donut({ slices, size = 128, thickness = 18, children }: {
  slices: readonly Slice[];
  size?: number;
  thickness?: number;
  children?: ReactNode;
}) {
  const total = slices.reduce((a, s) => a + s.value, 0);
  const r = size / 2 - thickness / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="donut" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke="var(--line)" strokeWidth={thickness} />
        {total > 0 && slices.map((s) => {
          const len = (s.value / total) * c;
          const dash = `${len} ${c - len}`;
          const node = (
            <circle key={s.label} cx={size / 2} cy={size / 2} r={r} fill="none"
              stroke={s.color} strokeWidth={thickness} strokeDasharray={dash}
              strokeDashoffset={-offset}
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
