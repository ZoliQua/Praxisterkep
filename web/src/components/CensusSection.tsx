// "Kik élnek ott, ahol nincs orvos?" — the 2022 census beside the vacancies.
//
// Five shares the census publishes for every járás (the kerület included,
// unlike TIMEA): adults with a degree, the employed, those doing nothing
// digital, poor dwellings, and households of only the old. Each has its map,
// its scatter against GP vacancy, and the association with income held
// still — because a poor járás is short of all of these at once.
import { useState } from 'react';
import { t } from '../lib/i18n';
import { formatDecimal } from '../lib/format';
import {
  incomeThird, metaOf, pairOf, partialOf, pValue, strengthOf, useOutcomes, valueOf,
} from '../lib/outcomes';
import { MapAndList } from './LivingSection';
import { OutcomeScatter, type ScatterPoint } from './charts/OutcomeScatter';

const KEYS = ['degree', 'employed', 'noDigital', 'poorHousing', 'elderlyOnly'] as const;

export function CensusSection() {
  const o = useOutcomes();
  const [measure, setMeasure] = useState<(typeof KEYS)[number]>('degree');
  const [picked, setPicked] = useState<string | null>(null);
  if (!o) return null;
  const meta = metaOf(measure);
  const third = incomeThird(o.districts);
  const points: ScatterPoint[] = o.districts
    .filter((r) => !r.capital && r.gpRate !== null && valueOf(r, measure) !== null)
    .map((r) => ({ id: r.name, label: r.name, sub: r.county, x: r.gpRate as number,
      y: valueOf(r, measure) as number, size: r.population, group: third(r) }));
  const pair = pairOf(o, 'gpRate', measure);
  const part = partialOf(o, 'gpRate', measure, 'income');
  const avoid = pairOf(o, measure, 'avoidable');
  const country = o.census.country;

  return (
    <section className="section container outcome" id="nepszamlalas">
      <h2 className="section__heading">{t('outcomes.census.heading')}</h2>
      <p className="section__lead">{t('outcomes.census.lead', {
        degree: metaOf('degree').format(country.degree),
        noDigital: metaOf('noDigital').format(country.noDigital),
        elderlyOnly: metaOf('elderlyOnly').format(country.elderlyOnly),
      })}</p>
      <div className="seg outcome__switch" role="group">
        {KEYS.map((k) => (
          <button key={k} type="button" aria-pressed={measure === k} onClick={() => setMeasure(k)}>
            {t(`outcomes.measure.${k}`)}
          </button>
        ))}
      </div>
      <p className="section__explain">{t(`outcomes.census.explain.${measure}`)}</p>
      <MapAndList o={o} measure={measure} picked={picked} onPick={setPicked}
        scale={{ domain: 'spread', invert: meta.direction === 'higherBetter' }} />
      <h3 className="outcome__sub">{t('outcomes.census.scatterHeading', {
        what: t(`outcomes.measure.${measure}`) })}</h3>
      <OutcomeScatter points={points}
        xLabel={t('outcomes.measure.gpRate')} yLabel={t(`outcomes.measure.${measure}`)}
        xFormat={metaOf('gpRate').format} yFormat={meta.format}
        groupLabels={[t('outcomes.third.0'), t('outcomes.third.1'), t('outcomes.third.2')]}
        selected={picked} onPick={setPicked} />
      {pair && (
        <p className="outcome__finding">
          {t('outcomes.census.finding', {
            what: t(`outcomes.measure.${measure}`),
            strength: t(`outcomes.strength.${strengthOf(pair.r)}`),
            r: formatDecimal(pair.r.toFixed(2)), p: pValue(pair.p),
          })}
          {part && ` ${t('outcomes.census.findingPartial', {
            r: formatDecimal(part.partial.toFixed(2)), p: pValue(part.p),
          })}`}
          {avoid && ` ${t('outcomes.census.findingAvoid', { r: formatDecimal(avoid.r.toFixed(2)) })}`}
        </p>
      )}
      <p className="section__source">{t('outcomes.census.source')}</p>
    </section>
  );
}
