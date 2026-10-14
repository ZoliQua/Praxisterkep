// "Megye" (megye.html) — the level between the country and a town.
//
// Everything on this site was either national or about one of 3177
// settlements; a county was only ever a filter on the map. This page answers
// the same questions one zoom level up, and hands the reader on to the
// settlements it is made of.
import { useMemo, useState } from 'react';
import { t } from '../lib/i18n';
import { formatDecimal, formatNumber, formatPercent } from '../lib/format';
import { useContextStore } from '../lib/context';
import { useHashScroll } from '../lib/useHashScroll';
import {
  countyOf, rankOf, settlementRows, useCounties, vacantShare,
  type Band, type SettlementRow, type State,
} from '../lib/counties';
import { settlementHref } from '../lib/settlementLink';
import { CountyRanking } from './CountyRanking';
import { CountyPicker } from './CountyPicker';
import { CountyChurn } from './CountyChurn';
import { AgeLegend, AgePie, type AgeKey } from './charts/AgePie';
import { Donut, DonutLegend } from './charts/Donut';
import { PointGrid } from './charts/PointGrid';
import { IconTooth } from './icons';
import { vacancyOf } from '../lib/vacancy';
import { PageNav } from './PageNav';
import { NextSteps } from './NextSteps';
import { Footer } from './Footer';

const NEXT = [
  { href: 'elemzo.html', titleKey: 'next.analysis.title', textKey: 'next.analysis.text' },
  { href: '/', titleKey: 'next.map.title', textKey: 'next.map.text' },
  { href: 'szakellato.html', titleKey: 'next.specialist.title',
    textKey: 'next.specialist.text' },
] as const;

type SortKey = 'name' | 'population' | 'band' | 'gpMin' | 'oncallMin';
const BAND_ORDER: Record<Band, number> = {
  kiemelt: 0, magas: 1, kozepes: 2, alacsony: 3, '': 4,
};

function minutes(value: number | null): string {
  // Hungarian decimals take a comma; formatDecimal is where that lives
  return value === null ? '–' : t('county.minutes', { n: formatDecimal(value.toFixed(1)) });
}

function StateDot({ state }: { state: State }) {
  return (
    <span className={`county-dot county-dot--${state || 'absent'}`}
      title={t(`county.state.${state || 'absent'}`)} />
  );
}

export function CountyPage() {
  useHashScroll();
  const data = useCounties();
  const county = useContextStore((s) => s.county);
  const setCounty = useContextStore((s) => s.setCounty);
  const kind = useContextStore((s) => s.kind);
  const setKind = useContextStore((s) => s.setKind);
  const [sort, setSort] = useState<SortKey>('band');
  // what the pointer is on, in each of the two charts: the card says what it
  // is rather than leaving the colour to be decoded against a legend
  const [ageOn, setAgeOn] = useState<AgeKey | null>(null);
  const [stateOn, setStateOn] = useState<string | null>(null);
  const [dentalOn, setDentalOn] = useState<string | null>(null);
  /** the settlement table below follows whichever slice was clicked */
  const [filter, setFilter] = useState<{ branch: 'gp' | 'dental'; state: State } | null>(null);

  const agg = countyOf(data, county);
  const rows = useMemo(() => {
    const list = settlementRows(data, county)
      .filter((r) => !filter || r[filter.branch] === filter.state);
    const by: Record<SortKey, (a: SettlementRow, b: SettlementRow) => number> = {
      name: (a, b) => a.name.localeCompare(b.name, 'hu'),
      population: (a, b) => b.population - a.population,
      band: (a, b) => BAND_ORDER[a.band] - BAND_ORDER[b.band]
        || b.population - a.population,
      gpMin: (a, b) => (b.gpMin ?? -1) - (a.gpMin ?? -1),
      oncallMin: (a, b) => (b.oncallMin ?? -1) - (a.oncallMin ?? -1),
    };
    return [...list].sort(by[sort]);
  }, [data, county, sort, filter]);

  // the settlements of the county by what their GP care looks like
  const stateSlices = agg ? [
    { value: agg.gpVacantOnly, color: '#ef6461',
      label: t('county.state.vacantOnly'), state: 'vacantOnly' as State },
    { value: agg.gpPartial, color: '#f0b429',
      label: t('county.state.partial'), state: 'partial' as State },
    { value: agg.settlements - agg.gpVacantOnly - agg.gpPartial,
      color: '#4fd6c2', label: t('county.state.filled'), state: 'filled' as State },
  ] : [];
  const active = stateSlices.find((s2) => s2.label === stateOn) ?? null;

  // the county's dental districts, as NEAK counts them
  // the county card always counts the dissolved districts: this ring is the
  // county's own stock, and a contract that ended is part of what became of
  // it. The ring says so with a slice of its own, which the dissolved never
  // get inside a single number.
  const dentalParts = vacancyOf(agg?.dentalDistricts, 'with');
  const dentalTotal = agg?.dentalDistricts?.total ?? 0;
  const dentalSlices = agg?.dentalDistricts ? [
    { value: agg.dentalDistricts.vacant, color: '#ef6461',
      label: t('stats.statusVacant'), state: 'vacantOnly' as State },
    { value: agg.dentalDistricts.dissolved, color: 'var(--line-strong)',
      label: t('stats.statusDissolved'), state: '' as State },
    { value: Math.max(agg.dentalDistricts.total - agg.dentalDistricts.vacant
      - agg.dentalDistricts.dissolved, 0), color: '#4fd6c2',
      label: t('stats.statusFilled'), state: 'filled' as State },
  ] : [];
  const dentalActive = dentalSlices.find((s2) => s2.label === dentalOn) ?? null;

  /** A slice names a class of settlement; clicking one shows just those. */
  const pickState = (branch: 'gp' | 'dental', label: string,
    slices: { label: string; state?: State }[]) => {
    const state = slices.find((s2) => s2.label === label)?.state;
    if (!state) return;
    setFilter((cur) => (cur && cur.branch === branch && cur.state === state
      ? null : { branch, state }));
  };

  const gpRank = rankOf(data, county, (c) => vacantShare(c, 'gp'));
  const oncallRank = rankOf(data, county, (c) => c.medianOncallMinutes);

  return (
    <>
      <PageNav kind={kind} onKind={setKind} />
      <section className="section container" id="varmegye">
        <h1 className="section__heading">{t('county.heading')}</h1>
        <p className="section__lead">{t('county.lead')}</p>

        <CountyPicker />

        <label className="county-picker">
          <span>{t('county.pick')}</span>
          <select value={county ?? ''} onChange={(e) => setCounty(e.target.value || null)}>
            <option value="">{t('county.pickNone')}</option>
            {(data?.counties ?? []).map((c) => (
              <option key={c.name} value={c.name}>{c.name}</option>
            ))}
          </select>
        </label>

        {!data && <p className="loading">…</p>}
        {data && !agg && <p className="section__explain">{t('county.nothingPicked')}</p>}

        {agg && (
          <>
            <div className="county-cards">
              {/* who lives here */}
              <article className="county-card">
                <div className="county-card__figure">
                  {agg.age && (
                    <AgePie split={agg.age} size={150} hole={44}
                      active={ageOn} onActive={setAgeOn} />
                  )}
                </div>
                <div className="county-card__body">
                  {ageOn && agg.age ? (
                    <>
                      <div className="stat__value">
                        {formatNumber(agg.age[ageOn])}
                      </div>
                      <div className="stat__label">{t('county.ageOf', {
                        group: t(`age.part.${ageOn}`),
                        share: formatPercent(agg.age[ageOn] / agg.age.total),
                      })}</div>
                    </>
                  ) : (
                    <>
                      <div className="stat__value">{formatNumber(agg.population)}</div>
                      <div className="stat__label">{t('county.population')}</div>
                    </>
                  )}
                  {agg.age && (
                    <AgeLegend split={agg.age} active={ageOn} onActive={setAgeOn} />
                  )}
                </div>
              </article>

              {/* how many of its settlements have nobody under contract */}
              <article className="county-card">
                <div className="county-card__figure">
                  <Donut size={150} thickness={20} slices={stateSlices}
                    active={stateOn} onActive={setStateOn}
                    onPick={(label: string) => pickState('gp', label, stateSlices)}>
                    <strong>{formatPercent(agg.gpVacantOnly / agg.settlements)}</strong>
                  </Donut>
                </div>
                <div className="county-card__body">
                  {active ? (
                    <>
                      <div className="stat__value">{formatNumber(active.value)}
                        <span className="stat__of"> / {formatNumber(agg.settlements)}</span>
                      </div>
                      <div className="stat__label">{t('county.stateOf', {
                        state: active.label.toLowerCase(),
                        share: formatPercent(active.value / agg.settlements),
                      })}</div>
                    </>
                  ) : (
                    <>
                      <div className="stat__value">{formatNumber(agg.gpVacantOnly)}
                        <span className="stat__of"> / {formatNumber(agg.settlements)}</span>
                      </div>
                      <div className="stat__label">{t('county.gpVacantOnlyOf')}</div>
                    </>
                  )}
                  <DonutLegend slices={stateSlices} active={stateOn}
                    onActive={setStateOn}
                    onPick={(label: string) => pickState('gp', label, stateSlices)} />
                  {gpRank && <div className="stat__context">
                    {t('county.rank', { rank: gpRank.rank, of: gpRank.of })}</div>}
                </div>
              </article>

              {/* the dental districts themselves, not the settlements */}
              <article className="county-card county-card--icon">
                <div className="county-card__ghost" aria-hidden="true"><IconTooth /></div>
                <div className="county-card__figure">
                  <Donut size={150} thickness={20} slices={dentalSlices}
                    active={dentalOn} onActive={setDentalOn}
                    onPick={(label: string) => pickState('dental', label, dentalSlices)}>
                    <strong>{formatPercent(
                      dentalParts.count / (dentalTotal || 1))}</strong>
                  </Donut>
                </div>
                <div className="county-card__body">
                  {dentalActive ? (
                    <>
                      <div className="stat__value">{formatNumber(dentalActive.value)}
                        <span className="stat__of"> / {formatNumber(dentalTotal)}</span>
                      </div>
                      <div className="stat__label">{t('county.dentalOf', {
                        state: dentalActive.label.toLowerCase(),
                      })}</div>
                    </>
                  ) : (
                    <>
                      <div className="stat__value">
                        {formatNumber(dentalParts.count)}
                        <span className="stat__of"> / {formatNumber(dentalTotal)}</span>
                      </div>
                      <div className="stat__label">{t('county.dentalDistricts')}</div>
                    </>
                  )}
                  <DonutLegend slices={dentalSlices} active={dentalOn}
                    onActive={setDentalOn}
                    onPick={(label: string) => pickState('dental', label, dentalSlices)} />
                  <div className="stat__context">{t('county.dentalLongTerm', {
                    n: formatNumber(agg.dentalDistricts?.longTerm ?? 0),
                    dissolved: formatNumber(agg.dentalDistricts?.dissolved ?? 0),
                  })}</div>
                </div>
              </article>

              {/* and what answers when the surgery is shut */}
              <article className="county-card county-card--wide">
                <div className="county-card__body">
                  <div className="stat__value">{formatNumber(agg.oncallPoints ?? 0)}
                    <span className="stat__of"> + {formatNumber(
                      agg.ambulanceStations ?? 0)}</span>
                  </div>
                  <div className="stat__label">{t('county.oncallAndAmbulance')}</div>
                  <PointGrid points={agg.emergency ?? []}
                    base={import.meta.env.BASE_URL} />
                  <div className="stat__context">
                    {agg.medianOncallMinutes !== null && t('county.oncallMedian', {
                      m: minutes(agg.medianOncallMinutes),
                    })}
                    {oncallRank && ` · ${t('county.rank', {
                      rank: oncallRank.rank, of: oncallRank.of })}`}
                  </div>
                </div>
              </article>
            </div>

            <table className="info-table">
              <tbody>
                <tr>
                  <th>{t('county.gpLine')}</th>
                  <td>{t('county.stateLine', {
                    filled: formatNumber(agg.gpFilled),
                    partial: formatNumber(agg.gpPartial),
                    vacant: formatNumber(agg.gpVacantOnly),
                  })}</td>
                </tr>
                <tr>
                  <th>{t('county.dentalLine')}</th>
                  <td>{t('county.stateLine', {
                    filled: formatNumber(agg.dentalFilled),
                    partial: formatNumber(agg.dentalPartial),
                    vacant: formatNumber(agg.dentalVacantOnly),
                  })}{' '}
                    <span className="county-note">{t('county.dentalSeats', {
                      n: formatNumber(agg.dentalAbsent),
                    })}</span>
                  </td>
                </tr>
                <tr>
                  <th>{t('county.travelLine')}</th>
                  <td>{t('county.travelValues', {
                    gp: minutes(agg.medianGpMinutes),
                    dental: minutes(agg.medianDentalMinutes),
                    inpatient: minutes(agg.medianInpatientMinutes),
                  })}</td>
                </tr>
                <tr>
                  <th>{t('county.busLine')}</th>
                  <td>{t('county.busValue', {
                    n: formatNumber(agg.withoutDirectBus),
                    share: formatPercent(agg.withoutDirectBus / agg.settlements),
                  })}</td>
                </tr>
                <tr>
                  <th>{t('county.bandLine')}</th>
                  <td>{t('county.bandValue', {
                    kiemelt: formatNumber(agg.bands.kiemelt ?? 0),
                    magas: formatNumber(agg.bands.magas ?? 0),
                  })}</td>
                </tr>
              </tbody>
            </table>

            <h2 className="section__subheading" id="telepulesek">
              {t('county.tableHeading', { county: agg.name })}
            </h2>
            <p className="section__explain">{t('county.tableExplain')}</p>
            {filter && (
              <p className="county-filter">
                {t('county.filtered', {
                  branch: t(`kinds.${filter.branch}.label`).toLowerCase(),
                  state: t(`county.state.${filter.state || 'absent'}`).toLowerCase(),
                  n: formatNumber(rows.length),
                })}
                <button type="button" onClick={() => setFilter(null)}>
                  {t('county.clearFilter')}
                </button>
              </p>
            )}
            <div className="county-sort">
              {(['band', 'population', 'name', 'gpMin', 'oncallMin'] as const).map((k) => (
                <button key={k} className={sort === k ? 'is-on' : ''}
                  onClick={() => setSort(k)}>{t(`county.sort.${k}`)}</button>
              ))}
            </div>
            <table className="info-table county-table">
              <thead>
                <tr>
                  <th>{t('county.thSettlement')}</th>
                  <th className="is-num">{t('county.thPopulation')}</th>
                  <th>{t('county.thGp')}</th>
                  <th>{t('county.thDental')}</th>
                  <th className="is-num">{t('county.thGpMin')}</th>
                  <th className="is-num">{t('county.thOncall')}</th>
                  <th>{t('county.thBand')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.slug}>
                    <td><a href={settlementHref(r.slug)}>{r.name}</a></td>
                    <td className="is-num">{formatNumber(r.population)}</td>
                    <td><StateDot state={r.gp} /></td>
                    <td><StateDot state={r.dental} /></td>
                    <td className="is-num">{minutes(r.gpMin)}</td>
                    <td className="is-num">{minutes(r.oncallMin)}</td>
                    <td>{r.band ? t(`county.band.${r.band}`) : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="extra-note">{t('county.caveat')}</p>
          </>
        )}

        <NextSteps items={NEXT} />
      </section>
      {/* how often a district changes physician — the archive's own answer */}
      <CountyChurn county={county} />
      {/* where every county stands, which is the question this page answers
          one row at a time */}
      <CountyRanking />
      <Footer />
    </>
  );
}

