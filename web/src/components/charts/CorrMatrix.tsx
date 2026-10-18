// What moves with what, all at once.
//
// Rows are the four things about care, columns the outcomes and
// circumstances; each cell is Pearson's r across the 174 rural járás,
// coloured red where the two rise together and teal where one falls as the
// other rises. A cell is faded when it is not distinguishable from chance
// (p ≥ 0.05) — a colour that means nothing should not look like one that
// does. With "income held still" on, the cells show the partial correlation
// instead, for the two vacancy rows where it is computed.
import { t } from '../../lib/i18n';
import { formatDecimal } from '../../lib/format';
import type { OutcomesRaw } from '../../lib/outcomes';
import { pairOf, partialOf } from '../../lib/outcomes';

export function CorrMatrix({ data, rows, cols, controlled, active, onPick }: {
  data: OutcomesRaw;
  rows: string[];
  cols: string[];
  controlled: boolean;
  active?: { x: string; y: string } | null;
  onPick?: (x: string, y: string) => void;
}) {
  const cell = (x: string, y: string) => {
    if (controlled) {
      const p = partialOf(data, x, y, 'income');
      return p ? { r: p.partial, p: p.p } : null;
    }
    const p = pairOf(data, x, y);
    return p ? { r: p.r, p: p.p } : null;
  };
  const color = (r: number, sig: boolean) => {
    const pct = Math.round(10 + Math.min(1, Math.abs(r) / 0.7) * 80);
    const c = r >= 0 ? '#ef6461' : '#5fb3a1';
    return `color-mix(in srgb, ${c} ${sig ? pct : Math.round(pct * 0.35)}%, var(--bg-raised))`;
  };
  return (
    <div className="corr-matrix" style={{ '--cols': cols.length } as React.CSSProperties}>
      <div className="corr-matrix__corner" />
      {cols.map((c) => (
        <div key={c} className="corr-matrix__col"><span>{t(`outcomes.measure.${c}`)}</span></div>
      ))}
      {rows.map((r) => (
        <div key={r} className="corr-matrix__row">
          <div className="corr-matrix__rowhead">{t(`outcomes.measure.${r}`)}</div>
          {cols.map((c) => {
            const v = r === c ? null : cell(r, c);
            const on = active?.x === r && active?.y === c;
            if (!v) return <div key={c} className="corr-matrix__cell is-empty">·</div>;
            const sig = v.p < 0.05;
            return (
              <button key={c} type="button"
                className={`corr-matrix__cell${on ? ' is-on' : ''}${sig ? '' : ' is-weak'}`}
                style={{ background: color(v.r, sig) }}
                title={t('outcomes.matrix.cellTitle', {
                  x: t(`outcomes.measure.${r}`), y: t(`outcomes.measure.${c}`),
                  r: formatDecimal(v.r.toFixed(2)),
                  p: v.p < 0.001 ? '< 0,001' : formatDecimal(v.p.toPrecision(2)),
                })}
                onClick={onPick ? () => onPick(r, c) : undefined}>
                {formatDecimal(v.r.toFixed(2))}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
