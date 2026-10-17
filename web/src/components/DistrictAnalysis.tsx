// "Jár-e együtt a szegénység az orvoshiánnyal?" — the question the járás
// level exists to answer.
//
// The national number cannot ask it: one vacancy rate against one development
// indicator is a single point. Twenty counties blur it — a county holds both
// a commuter belt and a shrinking district. 197 járás are enough observations
// to see whether the two move together, and few enough to name the outliers.
import { useMemo, useState } from 'react';
import { t } from '../lib/i18n';
import { formatDecimal, formatNumber, formatPercent } from '../lib/format';
import { useContextStore } from '../lib/context';
import {
  useDistricts, vacancyRate, type DistrictRow,
} from '../lib/districts';
import { DistrictScatter, type ScatterX } from './charts/DistrictScatter';

/** Pearson's r, and the n it rests on. */
function correlation(pairs: [number, number][]): { r: number; n: number } | null {
  const n = pairs.length;
  if (n < 10) return null;
  const mx = pairs.reduce((a, p) => a + p[0], 0) / n;
  const my = pairs.reduce((a, p) => a + p[1], 0) / n;
  let sxy = 0; let sxx = 0; let syy = 0;
  for (const [x, y] of pairs) {
    sxy += (x - mx) * (y - my);
    sxx += (x - mx) ** 2;
    syy += (y - my) ** 2;
  }
  const d = Math.sqrt(sxx * syy);
  return d ? { r: sxy / d, n } : null;
}

/** How a correlation is described in words, without overclaiming. */
function strength(r: number): string {
  const a = Math.abs(r);
  if (a < 0.2) return 'none';
  if (a < 0.4) return 'weak';
  if (a < 0.6) return 'moderate';
  return 'strong';
}

export function DistrictAnalysis() {
  const data = useDistricts();
  const kind = useContextStore((s) => s.kind);
  const [axis, setAxis] = useState<ScatterX>('development');
  const rows = useMemo(() => data?.districts ?? [], [data]);

  const stats = useMemo(() => {
    const pairs: [number, number][] = [];
    for (const d of rows) {
      const x = axis === 'development'
        ? d.development?.complex
        : kind === 'gp' ? d.medianGpMinutes : d.medianDentalMinutes;
      const y = vacancyRate(d, kind);
      if (x !== null && x !== undefined && y !== null) pairs.push([x, y]);
    }
    return correlation(pairs);
  }, [rows, axis, kind]);

  // the járás where the two disagree most: badly off and still covered, or
  // well off and short of doctors. Outliers are where a correlation stops
  // being a sentence and starts being a question.
  const extremes = useMemo(() => {
    const withBoth = rows.filter((d) => d.development && vacancyRate(d, kind) !== null);
    const byVacancy = (d: DistrictRow) => vacancyRate(d, kind) ?? 0;
    const poorButCovered = [...withBoth]
      .filter((d) => (d.development?.rank ?? 999) <= 40)
      .sort((a, b) => byVacancy(a) - byVacancy(b)).slice(0, 5);
    const richButShort = [...withBoth]
      .filter((d) => (d.development?.rank ?? 0) >= withBoth.length - 60)
      .sort((a, b) => byVacancy(b) - byVacancy(a)).slice(0, 5);
    return { poorButCovered, richButShort };
  }, [rows, kind]);

  if (!data) return null;

  return (
    <section className="section container" id="jarasok">
      <h2 className="section__heading">{t('districtAnalysis.heading')}</h2>
      <p className="section__explain">{t('districtAnalysis.explain', {
        kind: t(`kinds.${kind}.adj`),
      })}</p>

      <div className="map-controls">
        <div className="seg" role="group">
          {(['development', 'travel'] as ScatterX[]).map((x) => (
            <button key={x} aria-pressed={x === axis} onClick={() => setAxis(x)}>
              {t(`district.scatterAxis.${x}`)}
            </button>
          ))}
        </div>
      </div>

      <DistrictScatter data={data} branch={kind} selected="" axis={axis} />

      {stats && (
        <p className="district-verdict">
          {t(`districtAnalysis.r.${strength(stats.r)}`, {
            r: formatDecimal(stats.r.toFixed(2)),
            n: formatNumber(stats.n),
            axis: t(`districtAnalysis.axis.${axis}`),
            direction: t(stats.r < 0
              ? 'districtAnalysis.down' : 'districtAnalysis.up'),
          })}
          {' '}
          {t('districtAnalysis.caveat')}
        </p>
      )}

      <div className="district-outliers">
        {([
          ['poorButCovered', extremes.poorButCovered],
          ['richButShort', extremes.richButShort],
        ] as const).map(([key, list]) => (
          <div key={key}>
            <h3 className="why__chain-title">{t(`districtAnalysis.${key}`)}</h3>
            <p className="section__explain">{t(`districtAnalysis.${key}Explain`)}</p>
            <ul className="district-outliers__list">
              {list.map((d) => (
                <li key={d.name}>
                  <a href={`jaras.html?jar=${encodeURIComponent(d.name)}`}>{d.name}</a>
                  <span>{formatPercent(vacancyRate(d, kind) ?? 0)}</span>
                  <em>{t('districtAnalysis.devRank', {
                    rank: formatNumber(d.development?.rank ?? 0),
                  })}</em>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
