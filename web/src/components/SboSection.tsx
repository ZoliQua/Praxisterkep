// "Milyen messze a sürgősségi osztály?" — the emergency department by road.
//
// A GP is the first door; for a heart attack or a stroke the door that
// matters is the emergency department. This section measures it the way the
// site measures every other kind of care — free-flow minutes on the OSM road
// graph — and asks two things: who lives far, and who lives far *and* has no
// GP of their own. Its association with mortality is shown with the controls,
// and where it vanishes the page says so.
import { useState } from 'react';
import { t } from '../lib/i18n';
import { formatDecimal, formatNumber, formatPercent } from '../lib/format';
import {
  metaOf, pairOf, partialOf, pValue, useOutcomes,
} from '../lib/outcomes';
import { MapAndList } from './LivingSection';
import { PartialSteps } from './charts/PartialSteps';
import { settlementHref } from '../lib/settlementLink';

export function SboSection() {
  const o = useOutcomes();
  const [picked, setPicked] = useState<string | null>(null);
  if (!o) return null;
  const e = o.emergency;
  const total = Object.values(e.population).reduce((a, b) => a + b, 0);
  const pair = pairOf(o, 'sboMinutes', 'amenable');
  const part = partialOf(o, 'sboMinutes', 'amenable', 'income');
  const part2 = partialOf(o, 'sboMinutes', 'amenable', 'incomeDegree');

  return (
    <section className="section container outcome" id="surgosseg">
      <h2 className="section__heading">{t('outcomes.sbo.heading')}</h2>
      <p className="section__lead">{t('outcomes.sbo.lead', {
        points: e.points, median: formatDecimal(e.medianMin.toFixed(1)),
        // the 30+ band, not stats.beyond30: one rounds the minutes first, and
        // the lead and the bars under it must say the same number
        max: formatDecimal(e.maxMin.toFixed(0)), far: formatNumber(e.population['30+'] ?? 0),
      })}</p>
      <div className="bandbars">
        {e.bands.map((b) => {
          const v = e.population[b] ?? 0;
          return (
            <div key={b} className="bandbars__row">
              <span className="bandbars__label">{t(`outcomes.sbo.band.${b}`)}</span>
              <span className="bandbars__bar"><i style={{ width: `${(v / total) * 100}%` }} /></span>
              <b>{formatNumber(v)}</b>
              <small>{formatPercent(v / total)}</small>
            </div>
          );
        })}
      </div>
      <h3 className="outcome__sub">{t('outcomes.sbo.mapHeading')}</h3>
      <MapAndList o={o} measure="sboMinutes" picked={picked} onPick={setPicked}
        scale={{ domain: 'spread' }} />

      <div className="outcome__callout">
        <h3 className="outcome__sub">{t('outcomes.sbo.doublyHeading')}</h3>
        <p>{t('outcomes.sbo.doubly', {
          n: formatNumber(e.doubly.settlements), people: formatNumber(e.doubly.population),
        })}</p>
        <ol className="outcome__ranking-list">
          {e.doubly.list.slice(0, 12).map((s) => (
            <li key={s.slug}>
              <a href={settlementHref(s.slug)}>{s.name}</a>
              <span>{s.county} · {formatNumber(s.population)} {t('outcomes.sbo.people')} ·{' '}
                {metaOf('sboMinutes').format(s.minutes)}</span>
            </li>
          ))}
        </ol>
      </div>

      {pair && part && part2 && (
        <>
          <h3 className="outcome__sub">{t('outcomes.sbo.linkHeading')}</h3>
          <PartialSteps steps={[
            { key: 'raw', r: pair.r, p: pair.p },
            { key: 'income', r: part.partial, p: part.p },
            { key: 'incomeDegree', r: part2.partial, p: part2.p },
          ]} />
          <p className="outcome__finding">{t(part2.p < 0.05 ? 'outcomes.sbo.findingKept'
            : 'outcomes.sbo.findingGone', {
            r: formatDecimal(pair.r.toFixed(2)), p: pValue(pair.p),
            r2: formatDecimal(part2.partial.toFixed(2)), p2: pValue(part2.p),
          })}</p>
        </>
      )}
      <p className="section__source">{t('outcomes.sbo.source')}</p>
    </section>
  );
}
