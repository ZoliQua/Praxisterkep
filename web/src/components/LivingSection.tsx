// "Hol nehéz orvosnak lenni?" — the circumstances a vacancy sits in.
//
// Three readings, each with a map of the járás and a trend over the years:
// how much people earn (income), whether there is work (jobseekers), and
// whether the place is emptying — more deaths than births, more leaving than
// arriving. They are the reasons a district stays empty, and the reasons its
// people die sooner; the outcome section shows how much of the second is the
// first.
//
// Income across years is never compared in forints: 2022–23 alone brought
// 15–25 % inflation. The trend is each county's income as a share of the
// median járás that year, which removes the price level and keeps the
// standing.
import { useMemo, useState } from 'react';
import { t } from '../lib/i18n';
import { formatDecimal, formatMonth, formatNumber } from '../lib/format';
import {
  districtHref, metaOf, pairOf, ruralMedian, useOutcomes, valueOf, type OutcomesRaw,
} from '../lib/outcomes';
import { DistrictMap } from './charts/DistrictMap';
import { OutcomeScatter, type ScatterPoint } from './charts/OutcomeScatter';
import { TrendLines, type TrendSeries } from './charts/TrendLines';

function countySeries(o: OutcomesRaw, key: 'incomePerResident' | 'naturalChange' | 'migration',
  relative = false): { labels: string[]; series: TrendSeries[]; reference: TrendSeries } {
  const s = o.series[key];
  const series = Object.entries(s.counties).map(([name, vals]) => ({
    key: name, label: name,
    values: relative
      ? vals.map((v, i) => (v !== null && s.medianDistrict[i] ? (100 * v) / (s.medianDistrict[i] as number) : null))
      : vals,
  }));
  return {
    labels: s.years, series,
    reference: { key: 'median', label: t('outcomes.medianDistrict'),
      values: relative ? s.years.map(() => 100) : s.medianDistrict },
  };
}

export function MapAndList({ o, measure, picked, onPick, scale, top = 'worst' }: {
  o: OutcomesRaw; measure: string; picked: string | null; onPick: (n: string) => void;
  scale: Parameters<typeof DistrictMap>[0]['scale']; top?: 'worst' | 'best';
}) {
  const meta = metaOf(measure);
  // a kerület carries the capital's TIMEA value; on the map that would paint
  // 23 shapes with one number, so they are left empty for those measures
  const rows = o.districts.filter((r) => !(meta.capitalWide && r.capital));
  const values = new Map(rows.filter((r) => valueOf(r, measure) !== null)
    .map((r) => [r.name, valueOf(r, measure) as number]));
  const ranked = [...rows].filter((r) => valueOf(r, measure) !== null && !r.capital)
    .sort((a, b) => {
      const d = (valueOf(b, measure) as number) - (valueOf(a, measure) as number);
      return meta.direction === 'higherWorse' ? d : -d;
    });
  const list = top === 'worst' ? ranked.slice(0, 8) : ranked.slice(-8).reverse();
  return (
    <div className="outcome__pair">
      <DistrictMap values={values} selected={picked} onPick={onPick} legendFormat={meta.format}
        total={o.districts.length} scale={scale} color={meta.color}
        seatOf={(n) => o.districts.find((d) => d.name === n)?.county} />
      <div className="outcome__ranking">
        <h4>{t('outcomes.living.worstHeading')}</h4>
        <ol>
          {list.map((r) => (
            <li key={r.slug}>
              <a href={districtHref(r.name)}>{r.name}</a>
              <span>{meta.format(valueOf(r, measure) as number)}</span>
            </li>
          ))}
        </ol>
        <p className="outcome__hint">
          {t('outcomes.living.median', { value: meta.format(ruralMedian(o.districts, measure) as number) })}
          {meta.capitalWide && ` ${t('outcomes.living.capitalWide')}`}
        </p>
      </div>
    </div>
  );
}

export function LivingSection() {
  const o = useOutcomes();
  const [picked, setPicked] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>('Borsod-Abaúj-Zemplén');
  const [popKey, setPopKey] = useState<'naturalChange' | 'migration'>('migration');
  const income = useMemo(() => (o ? countySeries(o, 'incomePerResident', true) : null), [o]);
  const pop = useMemo(() => (o ? countySeries(o, popKey) : null), [o, popKey]);
  if (!o || !income || !pop) return null;

  const job = o.series.jobseekers;
  const jobLast = job.national.length - 1;
  const jobFirst = job.national.findIndex((v) => v !== null);
  const countiesJob: TrendSeries[] = Object.entries(job.counties)
    .map(([name, values]) => ({ key: name, label: name, values }));

  const rural = o.districts.filter((r) => !r.capital);
  const vacThirds = (() => {
    const v = rural.map((r) => r.gpRate).filter((x): x is number => x !== null).sort((a, b) => a - b);
    const c1 = v[Math.floor(v.length / 3)]; const c2 = v[Math.floor((2 * v.length) / 3)];
    return (x: number | null) => (x === null ? null : x < c1 ? 2 : x < c2 ? 1 : 0);
  })();
  const quadrant: ScatterPoint[] = rural
    .filter((r) => r.naturalChange !== null && r.migration !== null)
    .map((r) => ({ id: r.name, label: r.name, sub: r.county, x: r.naturalChange as number,
      y: r.migration as number, size: r.population, group: vacThirds(r.gpRate) }));
  const emptying = rural.filter((r) => (r.naturalChange ?? 0) < 0 && (r.migration ?? 0) < 0);
  const incomeAvoid = pairOf(o, 'income', 'avoidable');
  const jobGp = pairOf(o, 'gpRate', 'jobseekers');
  const yearSpan = `${o.smoothYears[0]}–${o.smoothYears[o.smoothYears.length - 1]}`;

  return (
    <>
      <section className="section container outcome" id="jovedelem">
        <h2 className="section__heading">{t('outcomes.income.heading')}</h2>
        <p className="section__lead">{t('outcomes.income.lead', {
          year: o.sources.territorial.incomeYear,
          median: metaOf('income').format(ruralMedian(o.districts, 'income') as number),
        })}</p>
        <MapAndList o={o} measure="income" picked={picked} onPick={setPicked}
          scale={{ domain: 'spread', invert: true }} top="worst" />
        <h3 className="outcome__sub">{t('outcomes.income.trendHeading')}</h3>
        <p className="section__explain">{t('outcomes.income.trendExplain')}</p>
        <TrendLines labels={income.labels} series={income.series} reference={income.reference}
          focus={focus} onFocus={setFocus} format={(v) => `${Math.round(v)}%`} minSpan={40} />
        <CountyChips focus={focus} onFocus={setFocus} names={income.series.map((s) => s.key)} />
        {incomeAvoid && (
          <p className="outcome__finding">{t('outcomes.income.finding', {
            r: formatDecimal(incomeAvoid.r.toFixed(2)),
          })}</p>
        )}
        <p className="section__source">{t('outcomes.income.source')}</p>
      </section>

      <section className="section container outcome" id="allaskeresok">
        <h2 className="section__heading">{t('outcomes.jobs.heading')}</h2>
        <p className="section__lead">{t('outcomes.jobs.lead', {
          month: formatMonth(job.months[jobLast]),
          count: formatNumber(job.nationalCount[jobLast]),
          rate: formatDecimal((job.national[jobLast] as number).toFixed(1)),
          long: formatNumber(job.nationalLong[jobLast]),
          first: formatMonth(job.months[jobFirst]),
          firstRate: formatDecimal((job.national[jobFirst] as number).toFixed(1)),
        })}</p>
        <MapAndList o={o} measure="jobseekers" picked={picked} onPick={setPicked}
          scale={{ domain: 'spread' }} />
        <h3 className="outcome__sub">{t('outcomes.jobs.trendHeading')}</h3>
        <TrendLines labels={job.months} series={countiesJob}
          reference={{ key: 'hu', label: t('outcomes.national'), values: job.national }}
          focus={focus} onFocus={setFocus} format={(v) => `${formatDecimal(v.toFixed(1))}%`} />
        <CountyChips focus={focus} onFocus={setFocus} names={countiesJob.map((s) => s.key)} />
        <p className="section__explain">{t('outcomes.jobs.quarterly')}</p>
        {jobGp && (
          <p className="outcome__finding">{t('outcomes.jobs.finding', {
            r: formatDecimal(jobGp.r.toFixed(2)),
          })}</p>
        )}
        <p className="section__source">{t('outcomes.jobs.source')}</p>
      </section>

      <section className="section container outcome" id="nepesseg">
        <h2 className="section__heading">{t('outcomes.pop.heading')}</h2>
        <p className="section__lead">{t('outcomes.pop.lead', {
          years: yearSpan, emptying: emptying.length, total: rural.length,
          people: formatNumber(emptying.reduce((a, r) => a + r.population, 0)),
        })}</p>
        <div className="seg outcome__switch" role="group">
          {(['migration', 'naturalChange'] as const).map((k) => (
            <button key={k} aria-pressed={popKey === k} onClick={() => setPopKey(k)}>
              {t(`outcomes.measure.${k}`)}
            </button>
          ))}
        </div>
        <MapAndList o={o} measure={popKey} picked={picked} onPick={setPicked}
          scale={{ mid: 0, invert: true, goodColor: '#5fb3a1' }} />
        <h3 className="outcome__sub">{t('outcomes.pop.quadrantHeading')}</h3>
        <p className="section__explain">{t('outcomes.pop.quadrantExplain')}</p>
        <OutcomeScatter points={quadrant}
          xLabel={t('outcomes.measure.naturalChange')} yLabel={t('outcomes.measure.migration')}
          xFormat={metaOf('naturalChange').format} yFormat={metaOf('migration').format}
          groupLabels={[t('outcomes.vacThird.0'), t('outcomes.vacThird.1'), t('outcomes.vacThird.2')]}
          selected={picked} onPick={(n) => { window.location.href = districtHref(n); }} />
        <h3 className="outcome__sub">{t('outcomes.pop.trendHeading', {
          what: t(`outcomes.measure.${popKey}`) })}</h3>
        <TrendLines labels={pop.labels} series={pop.series} reference={pop.reference}
          focus={focus} onFocus={setFocus} format={metaOf(popKey).format} />
        <CountyChips focus={focus} onFocus={setFocus} names={pop.series.map((s) => s.key)} />
        <p className="section__source">{t('outcomes.pop.source', { years: yearSpan })}</p>
      </section>
    </>
  );
}

/** The county picker under a trend chart: the same choice on every chart. */
export function CountyChips({ names, focus, onFocus }: {
  names: string[]; focus: string | null; onFocus: (n: string | null) => void;
}) {
  return (
    <div className="chips trend-lines__chips">
      {names.map((n) => (
        <button key={n} type="button" aria-pressed={focus === n}
          onClick={() => onFocus(focus === n ? null : n)}>{n}</button>
      ))}
    </div>
  );
}
