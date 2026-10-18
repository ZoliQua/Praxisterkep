// One section of the European page: a row of measures to pick from, and for
// the one picked the ranking, the map and the years behind them — all three
// answering to the same country group and the same country in focus.
import { useState } from 'react';
import { t } from '../../lib/i18n';
import {
  changeRows, formatValue, pairRows, ranking, reference, sectionIndicators, yearAxis,
  type EuSection, type EuropeGeo, type EuropeRaw,
} from '../../lib/europe';
import { TrendLines } from '../charts/TrendLines';
import { EuMap } from './EuMap';
import { EuRanking } from './EuRanking';
import { EuPairs } from './EuPairs';
import { EuChange } from './EuChange';
import { SourceLine } from './SourceLine';

export interface EuView {
  raw: EuropeRaw;
  geo: EuropeGeo | null;
  kind: 'gp' | 'dental';
  members: string[];
  frame: Set<string>;
  focus: string;
  onFocus: (geo: string) => void;
  nameOf: (geo: string) => string;
}

// the two-ended readings shown under the access section, per branch
// `text` names the indicator whose pairName/pairExplain the pair is written under
const PAIRS: Record<'gp' | 'dental', { key: string; text: string; a: string; b: string; aKey: string; bKey: string }[]> = {
  gp: [
    { key: 'gpVisit', text: 'gpVisit', a: 'gpVisitCity', b: 'gpVisitRural', aKey: 'europe.pair.city', bKey: 'europe.pair.rural' },
    { key: 'unmetMedIncome', text: 'unmetMed', a: 'unmetMedPoor', b: 'unmetMedRich', aKey: 'europe.pair.poor', bKey: 'europe.pair.rich' },
  ],
  dental: [
    { key: 'dentVisit', text: 'dentVisit', a: 'dentVisitCity', b: 'dentVisitRural', aKey: 'europe.pair.city', bKey: 'europe.pair.rural' },
    { key: 'unmetDentIncome', text: 'unmetDent', a: 'unmetDentPoor', b: 'unmetDentRich', aKey: 'europe.pair.poor', bKey: 'europe.pair.rich' },
  ],
};

export function IndicatorSection({ view, section, id, pick, onPick }: {
  view: EuView;
  section: EuSection;
  id: string;
  pick: string | undefined;
  onPick: (indicator: string) => void;
}) {
  const { raw, geo, kind, members, frame, focus, onFocus, nameOf } = view;
  const [pairKey, setPairKey] = useState(0);
  // the ranking now, or the move over ten years
  const [mode, setMode] = useState<'rank' | 'change'>('rank');
  const keys = sectionIndicators(raw, section, kind);
  if (!keys.length) {
    return (
      <section className="section container eu-section" id={id}>
        <h2 className="section__heading">{t(`europe.section.${section}.heading`)}</h2>
        <p className="section__explain">{t('europe.noBranch')}</p>
      </section>
    );
  }
  const key = pick && keys.includes(pick) ? pick : keys[0];
  const ind = raw.indicators[key];
  const fmt = (v: number) => formatValue(ind.unit, v);
  const rows = ranking(ind, members);
  const ref = reference(ind, rows);
  const refLabel = ref ? t(ref.kind === 'eu' ? 'europe.refEu' : 'europe.refMedian',
    { value: fmt(ref.value), year: ref.year }) : '';
  const years = yearAxis(ind, members);
  const byGeo = new Map(rows.map((r) => [r.geo, r]));
  const pairs = section === 'access' ? PAIRS[kind] : [];
  const pair = pairs[pairKey];
  const note = t(`europe.ind.${key}.note`);

  return (
    <section className="section container eu-section" id={id}>
      <h2 className="section__heading">{t(`europe.section.${section}.heading`)}</h2>
      <p className="section__lead">{t(`europe.section.${section}.lead`)}</p>
      <div className="seg eu-chips" role="group" aria-label={t('europe.pickMeasure')}>
        {keys.map((k) => (
          <button key={k} type="button" aria-pressed={k === key} onClick={() => onPick(k)}>
            {t(`europe.ind.${k}.short`)}
          </button>
        ))}
      </div>
      <h3 className="eu-section__measure">{t(`europe.ind.${key}.name`)}
        <span>{t(`europe.unit.${ind.unit}`)}</span></h3>
      <p className="section__explain">{t(`europe.ind.${key}.explain`)}</p>
      {!note.startsWith('europe.') && <p className="eu-note">{note}</p>}
      <div className="eu-pair">
        <div>
          <div className="seg seg--small eu-mode" role="group" aria-label={t('europe.change.modeLabel')}>
            <button type="button" aria-pressed={mode === 'rank'} onClick={() => setMode('rank')}>
              {t('europe.change.rank')}</button>
            <button type="button" aria-pressed={mode === 'change'} onClick={() => setMode('change')}>
              {t('europe.change.change')}</button>
          </div>
          {mode === 'rank' ? (
            <EuRanking ind={ind} rows={rows} members={members} focus={focus} onFocus={onFocus}
              nameOf={nameOf} format={fmt} refValue={ref?.value ?? null} refLabel={refLabel} />
          ) : (
            <EuChange rows={changeRows(ind, members)} members={members} better={ind.better} focus={focus} onFocus={onFocus}
              nameOf={nameOf} format={fmt} />
          )}
        </div>
        {geo && (
          <EuMap shapes={geo.countries.filter((c) => c.carried)} base={geo.countries.filter((c) => !c.carried)}
            frame={frame} better={ind.better} focus={focus} onPick={onFocus} nameOf={nameOf} format={fmt}
            attribution={geo.attribution}
            valueOf={(g) => { const r = byGeo.get(g); return r ? { value: r.value, year: r.year, stale: r.stale } : null; }} />
        )}
      </div>
      {years.length > 1 && (
        <>
          <h3 className="outcome__sub">{t('europe.trendHeading', { name: nameOf(focus) })}</h3>
          <TrendLines labels={years}
            series={members.filter((g) => ind.values[g]).map((g) => ({ key: g, label: nameOf(g),
              values: years.map((y) => ind.values[g][y] ?? null) }))}
            reference={Object.keys(ind.eu).length
              ? { key: 'EU', label: t('europe.country.EU'), values: years.map((y) => ind.eu[y] ?? null) }
              : undefined}
            focus={focus} onFocus={(g) => { if (g) onFocus(g); }} format={fmt} />
        </>
      )}
      {pair && (
        <div className="eu-pairs-block">
          <h3 className="outcome__sub">{t('europe.pairHeading')}</h3>
          <div className="seg eu-chips" role="group">
            {pairs.map((p, i) => (
              <button key={p.key} type="button" aria-pressed={i === pairKey} onClick={() => setPairKey(i)}>
                {t(`europe.ind.${p.text}.pairName`)}
              </button>
            ))}
          </div>
          <p className="section__explain">{t(`europe.ind.${pair.text}.pairExplain`)}</p>
          <EuPairs rows={pairRows(raw.indicators[pair.a], raw.indicators[pair.b], members)}
            aLabel={t(pair.aKey)} bLabel={t(pair.bKey)} focus={focus} onFocus={onFocus}
            nameOf={nameOf} format={(v) => formatValue(raw.indicators[pair.a].unit, v)} />
        </div>
      )}
      <SourceLine raw={raw} id={key} />
    </section>
  );
}
