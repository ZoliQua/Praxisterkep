// One horizontal bar per row, cut into parts that add up to the row.
//
// Used where a count has an outcome inside it — the winners of a year's
// grant split into "still filled", "vacant again", "could not be told
// apart" — so the reader sees both how many and what became of them. Every
// part names itself on hover; the legend under the chart is the colour key.
import { t } from '../../lib/i18n';
import { formatNumber } from '../../lib/format';

export interface StackedRow { key: string; label: string; parts: Record<string, number> }

export function StackedBars({ rows, order, colors, labelPrefix, max, onPick, selected }: {
  rows: StackedRow[];
  /** the parts, in drawing order */
  order: string[];
  colors: Record<string, string>;
  /** i18n prefix of each part's name */
  labelPrefix: string;
  max?: number;
  onPick?: (key: string) => void;
  selected?: string | null;
}) {
  const top = max ?? Math.max(1, ...rows.map((r) => order.reduce((a, k) => a + (r.parts[k] ?? 0), 0)));
  return (
    <div className="stacked">
      {rows.map((r) => {
        const total = order.reduce((a, k) => a + (r.parts[k] ?? 0), 0);
        // a row is a button only when choosing it does something
        const Row = onPick ? 'button' : 'div';
        return (
          <Row key={r.key} {...(onPick ? { type: 'button' as const, onClick: () => onPick(r.key),
            'aria-pressed': selected === r.key } : {})}
            className={`stacked__row${onPick ? ' is-pickable' : ''}${selected === r.key ? ' is-on' : ''}`}>
            <span className="stacked__label">{r.label}</span>
            <span className="stacked__track">
              {order.map((k) => (r.parts[k] ? (
                <i key={k} style={{ width: `${(r.parts[k] / top) * 100}%`, background: colors[k] }}
                  title={`${t(`${labelPrefix}.${k}`)}: ${formatNumber(r.parts[k])}`} />
              ) : null))}
            </span>
            <b>{formatNumber(total)}</b>
          </Row>
        );
      })}
      <div className="stacked__legend">
        {order.map((k) => (
          <span key={k}><i style={{ background: colors[k] }} />{t(`${labelPrefix}.${k}`)}</span>
        ))}
      </div>
    </div>
  );
}
