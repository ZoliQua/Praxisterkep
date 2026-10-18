// "A legveszélyeztetettebb járások" — where care is hardest to reach.
//
// The ranking is lib/vulnerability's: four access measures, each a
// percentile among the 174 rural járás, averaged. Every row shows the four
// ranks as bars, so a place is never "at risk" without saying why; under the
// list, two numbers say what goes with it — the avoidable mortality and the
// income of these járás against the rest.
import { useMemo, useState } from 'react';
import { t } from '../lib/i18n';
import { formatNumber } from '../lib/format';
import { districtHref, metaOf, useOutcomes } from '../lib/outcomes';
import { ACCESS_FACTORS, meanOf, rankVulnerable } from '../lib/vulnerability';

const SHOWN = [10, 20, 30] as const;

export function VulnerableDistricts() {
  const o = useOutcomes();
  const [n, setN] = useState<(typeof SHOWN)[number]>(20);
  const ranked = useMemo(() => (o ? rankVulnerable(o.districts) : []), [o]);
  if (!o || !ranked.length) return null;
  const top = ranked.slice(0, n);
  const rest = ranked.slice(n).map((v) => v.district);
  const topRows = top.map((v) => v.district);
  const people = topRows.reduce((a, d) => a + d.population, 0);
  const cmp = (key: 'avoidable' | 'income' | 'jobseekers') => ({
    top: meanOf(topRows, (d) => d[key]), rest: meanOf(rest, (d) => d[key]),
  });
  const avoid = cmp('avoidable');
  const income = cmp('income');
  const jobs = cmp('jobseekers');

  return (
    <section className="section container outcome" id="veszelyeztetett">
      <h2 className="section__heading">{t('vulnerable.heading')}</h2>
      <p className="section__lead">{t('vulnerable.lead')}</p>
      <div className="seg outcome__switch" role="group" aria-label={t('vulnerable.shown')}>
        {SHOWN.map((k) => (
          <button key={k} type="button" aria-pressed={n === k} onClick={() => setN(k)}>
            {t('vulnerable.top', { n: k })}
          </button>
        ))}
      </div>

      <div className="outcome__kpis">
        <div><b>{formatNumber(people)}</b><span>{t('vulnerable.kpi.people', { n })}</span></div>
        {avoid.top !== null && avoid.rest !== null && (
          <div><b>{formatNumber(Math.round(avoid.top))}</b>
            <span>{t('vulnerable.kpi.avoidable', { rest: formatNumber(Math.round(avoid.rest)) })}</span></div>
        )}
        {income.top !== null && income.rest !== null && (
          <div><b>{metaOf('income').format(income.top)}</b>
            <span>{t('vulnerable.kpi.income', { rest: metaOf('income').format(income.rest) })}</span></div>
        )}
        {jobs.top !== null && jobs.rest !== null && (
          <div><b>{metaOf('jobseekers').format(jobs.top)}</b>
            <span>{t('vulnerable.kpi.jobs', { rest: metaOf('jobseekers').format(jobs.rest) })}</span></div>
        )}
      </div>

      <div className="vulnerable">
        <div className="vulnerable__head">
          <span>{t('vulnerable.col.district')}</span>
          {ACCESS_FACTORS.map((k) => <span key={k}>{t(`vulnerable.factor.${k}`)}</span>)}
          <span>{t('vulnerable.col.score')}</span>
        </div>
        {top.map((v, i) => (
          <a key={v.district.slug} className="vulnerable__row" href={districtHref(v.district.name)}>
            <span className="vulnerable__name"><em>{i + 1}.</em> {v.district.name}
              <small>{v.district.county}</small></span>
            {ACCESS_FACTORS.map((k) => {
              const raw = v.district[k] as number;
              return (
                <span key={k} className="vulnerable__cell" title={`${t(`vulnerable.factor.${k}`)}: ${metaOf(k === 'noBusShare' ? 'gpRate' : k).format(raw)}`}>
                  <i style={{ width: `${Math.max(4, v.ranks[k] * 100)}%` }} />
                  <b>{k === 'noBusShare' || k === 'gpRate'
                    ? `${formatNumber(Math.round(raw * 100))}%` : metaOf(k).format(raw)}</b>
                </span>
              );
            })}
            <span className="vulnerable__score">{formatNumber(Math.round(v.score * 100))}</span>
          </a>
        ))}
      </div>
      <p className="section__explain">{t('vulnerable.how')}</p>
      <p className="section__source">{t('vulnerable.source')}</p>
    </section>
  );
}
