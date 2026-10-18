// "Egészség és életkörülmények" on the county page.
//
// A county is measured against the other nineteen (five small rankings, the
// county lit up in each), over time (jobseekers against the country, income
// against the median járás) and from the inside: its járás side by side, so
// the page hands the reader down a level instead of averaging it away.
import { t } from '../lib/i18n';
import { formatDecimal } from '../lib/format';
import { districtHref, metaOf, useOutcomes, valueOf, type OutcomeCounty } from '../lib/outcomes';
import { TrendLines } from './charts/TrendLines';

const RANKS = ['avoidable', 'income', 'jobseekers', 'naturalChange', 'migration'] as const;

function Ranking({ counties, k, selected }: {
  counties: OutcomeCounty[]; k: (typeof RANKS)[number]; selected: string;
}) {
  const meta = metaOf(k);
  const rows = counties.filter((c) => c[k] !== null)
    .sort((a, b) => {
      const d = (b[k] as number) - (a[k] as number);
      return meta.direction === 'higherWorse' ? d : -d;
    });
  const vals = rows.map((r) => r[k] as number);
  const lo = Math.min(0, ...vals); const hi = Math.max(0, ...vals);
  const pos = (v: number) => ((v - lo) / (hi - lo || 1)) * 100;
  const rank = rows.findIndex((r) => r.name === selected) + 1;
  return (
    <article className="county-rank">
      <h3>{t(`outcomes.measure.${k}`)}</h3>
      {rank > 0 && <p className="county-rank__place">{t('outcomes.county.place', { rank, of: rows.length })}</p>}
      <ol>
        {rows.map((r) => {
          const v = r[k] as number;
          const left = Math.min(pos(0), pos(v)); const width = Math.abs(pos(v) - pos(0));
          return (
            <li key={r.name} className={r.name === selected ? 'is-on' : ''}>
              <span className="county-rank__name">{r.name}</span>
              <span className="county-rank__track">
                <i style={{ left: `${left}%`, width: `${Math.max(width, 0.8)}%` }} />
              </span>
              <b>{meta.format(v)}</b>
            </li>
          );
        })}
      </ol>
    </article>
  );
}

export function CountyOutcomes({ county }: { county: string }) {
  const o = useOutcomes();
  if (!o) return null;
  const c = o.counties.find((x) => x.name === county);
  if (!c) return null;
  const jobs = o.series.jobseekers.counties[county];
  const inc = o.series.incomePerResident;
  const incCounty = inc.counties[county];
  const incomeIndex = incCounty?.map((v, i) => (v !== null && inc.medianDistrict[i]
    ? (100 * v) / (inc.medianDistrict[i] as number) : null));
  const districts = o.districts.filter((d) => d.county === county)
    .sort((a, b) => (b.avoidable ?? 0) - (a.avoidable ?? 0));
  const fmtA = metaOf('avoidable').format;

  return (
    <>
      <h2 className="section__subheading" id="egeszseg">{t('outcomes.county.heading', { county })}</h2>
      <p className="section__explain">{t('outcomes.county.explain', { year: o.sources.mortality.year })}</p>
      <div className="county-ranks">
        {RANKS.map((k) => <Ranking key={k} counties={o.counties} k={k} selected={county} />)}
      </div>

      <div className="outcome__pair">
        {jobs && (
          <div>
            <h3 className="outcome__sub">{t('outcomes.county.jobsHeading')}</h3>
            <TrendLines labels={o.series.jobseekers.months}
              series={[{ key: county, label: county, values: jobs }]}
              reference={{ key: 'hu', label: t('outcomes.national'), values: o.series.jobseekers.national }}
              focus={county} format={(v) => `${formatDecimal(v.toFixed(1))}%`} />
          </div>
        )}
        {incomeIndex && (
          <div>
            <h3 className="outcome__sub">{t('outcomes.county.incomeHeading')}</h3>
            <TrendLines labels={inc.years}
              series={[{ key: county, label: county, values: incomeIndex }]}
              reference={{ key: 'median', label: t('outcomes.medianDistrict'), values: inc.years.map(() => 100) }}
              focus={county} format={(v) => `${Math.round(v)}%`} minSpan={40} />
          </div>
        )}
      </div>

      <h3 className="outcome__sub">{t('outcomes.county.districtsHeading', { county })}</h3>
      <div className="table-wrap">
        <table className="county-table outcome-table">
          <thead>
            <tr>
              <th>{t('outcomes.county.colDistrict')}</th>
              <th>{t('outcomes.measure.gpRate')}</th>
              <th>{t('outcomes.measure.avoidable')}</th>
              <th>{t('outcomes.measure.income')}</th>
              <th>{t('outcomes.measure.jobseekers')}</th>
              <th>{t('outcomes.measure.migration')}</th>
            </tr>
          </thead>
          <tbody>
            {districts.map((d) => (
              <tr key={d.slug}>
                <td><a href={districtHref(d.name)}>{d.name}</a></td>
                <td>{d.gpRate === null ? '–' : metaOf('gpRate').format(d.gpRate)}</td>
                <td>{d.avoidable === null ? '–' : fmtA(d.avoidable)}</td>
                <td>{d.capital || valueOf(d, 'income') === null ? '–' : metaOf('income').format(d.income as number)}</td>
                <td>{d.jobseekers === null ? '–' : metaOf('jobseekers').format(d.jobseekers)}</td>
                <td>{d.capital || d.migration === null ? '–' : metaOf('migration').format(d.migration)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {county === 'Budapest' && <p className="outcome__hint">{t('outcomes.living.capitalWide')}</p>}
      <p className="section__source">{t('outcomes.district.source')}</p>
    </>
  );
}
