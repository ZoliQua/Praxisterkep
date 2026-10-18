// The table that answers "is it just poverty?".
//
// Rows are the income thirds of the 174 rural járás, columns their GP
// vacancy thirds; each cell holds the median of the outcome among the járás
// that fall into it. Read along a row and income is held still: if the
// numbers still climb to the right, vacancy goes with the outcome among
// places equally poor. The shade is the same scale across all nine cells, so
// the eye can read both directions at once.
import { t } from '../../lib/i18n';
import type { Grid } from '../../lib/outcomes';

export function TertileGrid({ grid, format, active, onPick }: {
  grid: Grid;
  format: (v: number) => string;
  /** the cell whose járás are highlighted, as [row, col] */
  active?: [number, number] | null;
  onPick?: (cell: [number, number] | null) => void;
}) {
  const vals = grid.cells.flat().map((c) => c.median).filter((v): v is number => v !== null);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const shade = (v: number | null) => {
    if (v === null) return 'var(--bg-panel)';
    const f = hi > lo ? (v - lo) / (hi - lo) : 0.5;
    return `color-mix(in srgb, #ef6461 ${Math.round(12 + f * 78)}%, var(--bg-raised))`;
  };
  const rowsTopDown = [2, 1, 0]; // richest third on top reads like a map legend
  const isOn = (r: number, c: number) => active?.[0] === r && active?.[1] === c;

  return (
    <div className="tertile-grid" role="table" aria-label={t('outcomes.grid.aria')}>
      <div className="tertile-grid__corner" role="columnheader">
        <span>{t('outcomes.grid.rows')}</span>
        <span>{t('outcomes.grid.cols')} →</span>
      </div>
      {[0, 1, 2].map((c) => (
        <div key={`h${c}`} className="tertile-grid__head" role="columnheader">
          {t(`outcomes.grid.vac${c}`)}
        </div>
      ))}
      {rowsTopDown.map((r) => (
        <div key={`r${r}`} className="tertile-grid__row" role="row">
          <div className="tertile-grid__rowhead" role="rowheader">
            {t(`outcomes.grid.inc${r}`)}
          </div>
          {[0, 1, 2].map((c) => {
            const cell = grid.cells[r][c];
            return (
              <button key={c} type="button" role="cell"
                className={`tertile-grid__cell${isOn(r, c) ? ' is-on' : ''}`}
                style={{ background: shade(cell.median) }}
                onClick={onPick ? () => onPick(isOn(r, c) ? null : [r, c]) : undefined}
                aria-pressed={isOn(r, c)}>
                <b>{cell.median === null ? '–' : format(cell.median)}</b>
                <small>{t('outcomes.grid.n', { n: cell.n })}</small>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
