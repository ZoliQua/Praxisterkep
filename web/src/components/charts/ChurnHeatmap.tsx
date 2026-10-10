// Where and when the doctors changed: counties down, years across.
//
// The colour is not a count but a rate — changes per 100 districts per year —
// because the archive's snapshots are unevenly spaced and a count would
// mostly show when we happened to keep a file. A year the archive never saw
// is left blank, not drawn as a quiet zero.
import { t } from '../../lib/i18n';
import { formatDecimal } from '../../lib/format';
import { useContextStore } from '../../lib/context';
import type { Matrix } from '../../lib/churnMatrix';

export function ChurnHeatmap({ matrix }: { matrix: Matrix }) {
  const county = useContextStore((s) => s.county);
  const setCounty = useContextStore((s) => s.setCounty);
  if (!matrix.rows.length) return null;

  const shade = (rate: number | null) => {
    if (rate === null) return 'transparent';
    const share = matrix.max ? Math.min(rate / matrix.max, 1) : 0;
    // one hue, varying weight: the eye should read "more" and "less", not
    // "red means bad somewhere and good elsewhere"
    return `color-mix(in srgb, #ef6461 ${Math.round(8 + share * 92)}%, transparent)`;
  };

  return (
    <div className="heatmap">
      <table>
        <thead>
          <tr>
            <th scope="col">{t('stats.thCounty')}</th>
            {matrix.years.map((year) => (
              <th key={year} scope="col">{year}</th>
            ))}
            <th scope="col" className="heatmap__overall">{t('churn.colOverall')}</th>
          </tr>
        </thead>
        <tbody>
          {matrix.rows.map((row) => (
            <tr key={row.county}
              className={row.county === county ? 'is-on' : undefined}>
              <th scope="row">
                <button type="button"
                  onClick={() => setCounty(row.county === county ? null : row.county)}>
                  {row.county}
                </button>
              </th>
              {row.cells.map((cell) => (
                <td key={cell.year} style={{ background: shade(cell.rate) }}
                  title={cell.rate === null
                    ? t('churn.cellNone', { year: cell.year, county: row.county })
                    : t('churn.cell', {
                      county: row.county, year: cell.year,
                      rate: formatDecimal(cell.rate.toFixed(1)),
                      changes: formatDecimal(cell.changes.toFixed(1)),
                      months: String(cell.months),
                    })}>
                  {cell.rate === null ? '·' : formatDecimal(cell.rate.toFixed(0))}
                </td>
              ))}
              <td className="heatmap__overall">
                {row.overall === null ? '–' : formatDecimal(row.overall.toFixed(1))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
