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
import { AgeLegend, AgePie } from './charts/AgePie';
import { Donut } from './charts/Donut';
import { IconAmbulance, IconOncall, IconTooth } from './icons';
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
  const [sort, setSort] = useState<SortKey>('band');

  const agg = countyOf(data, county);
  const rows = useMemo(() => {
    const list = settlementRows(data, county);
    const by: Record<SortKey, (a: SettlementRow, b: SettlementRow) => number> = {
      name: (a, b) => a.name.localeCompare(b.name, 'hu'),
      population: (a, b) => b.population - a.population,
      band: (a, b) => BAND_ORDER[a.band] - BAND_ORDER[b.band]
        || b.population - a.population,
      gpMin: (a, b) => (b.gpMin ?? -1) - (a.gpMin ?? -1),
      oncallMin: (a, b) => (b.oncallMin ?? -1) - (a.oncallMin ?? -1),
    };
    return [...list].sort(by[sort]);
  }, [data, county, sort]);

  const gpRank = rankOf(data, county, (c) => vacantShare(c, 'gp'));
  const oncallRank = rankOf(data, county, (c) => c.medianOncallMinutes);

  return (
    <>
      <PageNav />
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
                  {agg.age && <AgePie split={agg.age} size={116} hole={34} />}
                </div>
                <div className="county-card__body">
                  <div className="stat__value">{formatNumber(agg.population)}</div>
                  <div className="stat__label">{t('county.population')}</div>
                  {agg.age && <AgeLegend split={agg.age} />}
                </div>
              </article>

              {/* how many of its settlements have nobody under contract */}
              <article className="county-card">
                <div className="county-card__figure">
                  <Donut thickness={16} slices={[
                    { value: agg.gpVacantOnly, color: '#ef6461',
                      label: t('county.gpVacantOnly') },
                    { value: agg.gpPartial, color: '#f0b429',
                      label: t('county.state.partial') },
                    { value: agg.settlements - agg.gpVacantOnly - agg.gpPartial,
                      color: '#4fd6c2', label: t('county.state.filled') },
                  ]}>
                    <strong>{formatPercent(agg.gpVacantOnly / agg.settlements)}</strong>
                  </Donut>
                </div>
                <div className="county-card__body">
                  <div className="stat__value">{formatNumber(agg.gpVacantOnly)}
                    <span className="stat__of"> / {formatNumber(agg.settlements)}</span>
                  </div>
                  <div className="stat__label">{t('county.gpVacantOnlyOf')}</div>
                  {gpRank && <div className="stat__context">
                    {t('county.rank', { rank: gpRank.rank, of: gpRank.of })}</div>}
                </div>
              </article>

              {/* the dental districts themselves, not the settlements */}
              <article className="county-card county-card--icon">
                <div className="county-card__ghost" aria-hidden="true"><IconTooth /></div>
                <div className="county-card__body">
                  <div className="stat__value">
                    {formatNumber(agg.dentalDistricts?.vacant ?? 0)}
                    <span className="stat__of"> / {formatNumber(
                      agg.dentalDistricts?.total ?? 0)}</span>
                  </div>
                  <div className="stat__label">{t('county.dentalDistricts')}</div>
                  <div className="stat__context">{t('county.dentalLongTerm', {
                    n: formatNumber(agg.dentalDistricts?.longTerm ?? 0),
                    dissolved: formatNumber(agg.dentalDistricts?.dissolved ?? 0),
                  })}</div>
                </div>
              </article>

              {/* and what answers when the surgery is shut */}
              <article className="county-card county-card--icon">
                <div className="county-card__ghost" aria-hidden="true"><IconOncall /></div>
                <div className="county-card__body">
                  <div className="stat__value">{formatNumber(agg.oncallPoints ?? 0)}</div>
                  <div className="stat__label">{t('county.oncallPoints')}</div>
                  <div className="stat__context">
                    <IconAmbulance /> {t('county.ambulance', {
                      n: formatNumber(agg.ambulanceStations ?? 0),
                    })}
                    {agg.medianOncallMinutes !== null && ` · ${t('county.oncallMedian', {
                      m: minutes(agg.medianOncallMinutes),
                    })}`}
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

