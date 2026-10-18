// Now and later on one line per row: a hollow dot for today, a filled one
// for the forecast, joined — so a county whose line runs right is one whose
// vacancies are expected to grow, and the length says by how much.
import { t } from '../../lib/i18n';

export interface DumbbellRow { key: string; label: string; from: number; to: number;
  band?: [number, number]; href?: string }

export function Dumbbell({ rows, format, fromLabel, toLabel, selected, onPick }: {
  rows: DumbbellRow[];
  format: (v: number) => string;
  fromLabel: string;
  toLabel: string;
  selected?: string | null;
  onPick?: (key: string) => void;
}) {
  const hi = Math.max(...rows.flatMap((r) => [r.from, r.to, r.band?.[1] ?? 0]), 0.01) * 1.08;
  const x = (v: number) => `${(v / hi) * 100}%`;
  return (
    <div className="dumbbell">
      <div className="dumbbell__legend">
        <span><i className="is-from" />{fromLabel}</span>
        <span><i className="is-to" />{toLabel}</span>
      </div>
      {rows.map((r) => {
        const up = r.to >= r.from;
        return (
          <div key={r.key} className={`dumbbell__row${selected === r.key ? ' is-on' : ''}`}
            // hover shows a county's path; focus does the same from the keyboard
            onMouseEnter={onPick ? () => onPick(r.key) : undefined}
            onFocus={onPick ? () => onPick(r.key) : undefined}
            tabIndex={onPick ? 0 : undefined}>
            <span className="dumbbell__label">
              {r.href ? <a href={r.href}>{r.label}</a> : r.label}
            </span>
            <span className="dumbbell__track"
              title={t('outcomes.forecast.dumbbellTitle', { name: r.label, from: format(r.from), to: format(r.to) })}>
              {r.band && <em style={{ left: x(r.band[0]), width: `${((r.band[1] - r.band[0]) / hi) * 100}%` }} />}
              <span className={`dumbbell__bar${up ? ' is-up' : ' is-down'}`}
                style={{ left: x(Math.min(r.from, r.to)), width: `${(Math.abs(r.to - r.from) / hi) * 100}%` }} />
              <i className="dumbbell__dot is-from" style={{ left: x(r.from) }} />
              <i className="dumbbell__dot is-to" style={{ left: x(r.to) }} />
            </span>
            <b>{format(r.to)}</b>
          </div>
        );
      })}
    </div>
  );
}
