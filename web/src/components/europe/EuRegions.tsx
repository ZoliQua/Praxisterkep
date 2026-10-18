// The NUTS 2 regions: Hungary's eight among the regions of the countries
// picked, on a map and in a ranking, and then pair by pair across the
// border — the comparison that holds the most constant, since the two sides
// share the landscape, the climate and much of the history.
import { useState } from 'react';
import { t } from '../../lib/i18n';
import {
  formatValue, latest, ranking, reference, type EuIndicator, type EuropeRaw,
} from '../../lib/europe';
import { EuMap } from './EuMap';
import { EuRanking } from './EuRanking';
import type { EuView } from './IndicatorSection';

/** A regional measure in the shape the country selectors read. */
function asIndicator(raw: EuropeRaw, key: string): EuIndicator {
  const meta = raw.regional.indicators[key];
  const values: Record<string, Record<string, number>> = {};
  for (const [g, v] of Object.entries(raw.regional.values)) if (v[key]) values[g] = v[key];
  return { section: 'outcomes', branch: 'both', better: meta.better, unit: meta.unit, source: 'eurostat',
    dataset: meta.dataset, url: meta.url, fetched: raw.fetched[`regional:${meta.dataset}`] ?? '',
    years: [], values, eu: {}, sourceByGeo: {} };
}

export function EuRegions({ view }: { view: EuView }) {
  const { raw, geo, members, nameOf: countryName } = view;
  const keys = Object.keys(raw.regional.indicators);
  const [key, setKey] = useState(keys[0]);
  const [focus, setFocus] = useState('HU31');
  const ind = asIndicator(raw, key);
  const fmt = (v: number) => formatValue(ind.unit, v);
  const regionName = (g: string) => `${raw.regional.names[g] ?? g}`;
  const label = (g: string) => `${regionName(g)} (${countryName(g.slice(0, 2))})`;
  const inGroup = Object.keys(raw.regional.values).filter((g) => members.includes(g.slice(0, 2)));
  const rows = ranking(ind, inGroup);
  const ref = reference(ind, rows);
  const byGeo = new Map(rows.map((r) => [r.geo, r]));
  const frame = new Set(inGroup);
  const unmapped = raw.regional.unmapped.filter((g) => members.includes(g.slice(0, 2)));
  const note = t(`europe.region.${key}.note`);

  return (
    <>
      <section className="section container eu-section" id="regiok">
        <h2 className="section__heading">{t('europe.regions.heading')}</h2>
        <p className="section__lead">{t('europe.regions.lead')}</p>
        <div className="seg eu-chips" role="group" aria-label={t('europe.pickMeasure')}>
          {keys.map((k) => (
            <button key={k} type="button" aria-pressed={k === key} onClick={() => setKey(k)}>
              {t(`europe.region.${k}.short`)}
            </button>
          ))}
        </div>
        <h3 className="eu-section__measure">{t(`europe.region.${key}.name`)}
          <span>{t(`europe.unit.${ind.unit}`)}</span></h3>
        <p className="section__explain">{t(`europe.region.${key}.explain`)}</p>
        {!note.startsWith('europe.') && <p className="eu-note">{note}</p>}
        <div className="eu-pair eu-pair--regions">
          {geo && (
            <EuMap shapes={geo.regions} base={geo.countries} frame={frame} better={ind.better}
              focus={focus} onPick={setFocus} nameOf={label} format={fmt} attribution={geo.attribution}
              legendKey="europe.regions.aria"
              valueOf={(g) => { const r = byGeo.get(g); return r ? { value: r.value, year: r.year, stale: r.stale } : null; }} />
          )}
          <div className="eu-rank--scroll">
            <EuRanking ind={ind} rows={rows} members={inGroup} focus={focus} onFocus={setFocus}
              nameOf={label} format={fmt} refValue={ref?.value ?? null}
              refLabel={ref ? t('europe.refMedianRegions', { value: fmt(ref.value) }) : ''} />
          </div>
        </div>
        {unmapped.length > 0 && (
          <p className="outcome__hint">{t('europe.regions.unmapped', { n: unmapped.length })}</p>
        )}
        <p className="section__source">
          {t('europe.source.eurostat', { dataset: ind.dataset, fetched: ind.fetched })}{' '}
          <a href={ind.url} target="_blank" rel="noopener noreferrer">{t('europe.source.open')}</a>
        </p>
      </section>

      <section className="section container eu-section" id="hatar">
        <h2 className="section__heading">{t('europe.border.heading')}</h2>
        <p className="section__lead">{t('europe.border.lead')}</p>
        <div className="eu-border">
          {raw.regional.borderPairs.map(([a, b]) => (
            <article key={`${a}-${b}`} className="eu-border__pair">
              <header>
                <button type="button" onClick={() => setFocus(a)}>{regionName(a)}</button>
                <span aria-hidden="true">⟷</span>
                <button type="button" onClick={() => setFocus(b)}>{regionName(b)}
                  <small>{countryName(b.slice(0, 2))}</small></button>
              </header>
              {keys.map((k) => {
                const meta = raw.regional.indicators[k];
                const la = latest(raw.regional.values[a]?.[k]);
                const lb = latest(raw.regional.values[b]?.[k]);
                if (!la || !lb) return null;
                const hi = Math.max(la.value, lb.value) * 1.05;
                const aBetter = meta.better === 'neutral' ? null
                  : meta.better === 'higher' ? la.value > lb.value : la.value < lb.value;
                const f = (v: number) => formatValue(meta.unit, v);
                return (
                  <div key={k} className="eu-border__row">
                    <span className="eu-border__name">{t(`europe.region.${k}.short`)}
                      <small>{la.year === lb.year ? la.year : `${la.year} / ${lb.year}`}</small></span>
                    <span className={`eu-border__bar is-a${aBetter === true ? ' is-better' : ''}`}>
                      <i style={{ width: `${(la.value / hi) * 100}%` }} /><b>{f(la.value)}</b></span>
                    <span className={`eu-border__bar is-b${aBetter === false ? ' is-better' : ''}`}>
                      <i style={{ width: `${(lb.value / hi) * 100}%` }} /><b>{f(lb.value)}</b></span>
                  </div>
                );
              })}
            </article>
          ))}
        </div>
        <p className="outcome__hint">{t('europe.border.note')}</p>
      </section>
    </>
  );
}
