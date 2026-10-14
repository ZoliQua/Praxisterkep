// "Járás" (jaras.html) — the level between a county and a town.
//
// A county has one vacancy rate; its járás have as many as there are járás,
// and they are not the same country. This page is that resolution: the whole
// country painted at 197 shapes, where one of them stands among the others,
// and what its own settlements look like underneath.
import { useMemo, useState } from 'react';
import { t } from '../lib/i18n';
import { formatDecimal, formatNumber, formatPercent, huArticle } from '../lib/format';
import { useContextStore } from '../lib/context';
import { useHashScroll } from '../lib/useHashScroll';
import { settlementHref } from '../lib/settlementLink';
import {
  districtOf, per10k, rankOf, settlementRows, useDistricts, vacancyRate,
  type Band, type DistrictRow, type SettlementRow, type State,
} from '../lib/districts';
import { AgeLegend, AgePie, type AgeKey } from './charts/AgePie';
import { Donut, DonutLegend } from './charts/Donut';
import { DistrictMap } from './charts/DistrictMap';
import { DistrictRanking } from './charts/DistrictRanking';
import { DistrictScatter } from './charts/DistrictScatter';
import { PageNav } from './PageNav';
import { NextSteps } from './NextSteps';
import { Footer } from './Footer';

const NEXT = [
  { href: 'megye.html', titleKey: 'next.county.title', textKey: 'next.county.text' },
  { href: 'telepules/', titleKey: 'next.settlement.title',
    textKey: 'next.settlement.text' },
  { href: 'elemzo.html', titleKey: 'next.analysis.title', textKey: 'next.analysis.text' },
] as const;

type SortKey = 'name' | 'population' | 'band' | 'gpMin' | 'oncallMin';
const BAND_ORDER: Record<Band, number> = {
  kiemelt: 0, magas: 1, kozepes: 2, alacsony: 3, '': 4,
};

function minutes(value: number | null): string {
  return value === null ? '–' : t('county.minutes', { n: formatDecimal(value.toFixed(1)) });
}

function StateDot({ state }: { state: State }) {
  return (
    <span className={`county-dot county-dot--${state || 'absent'}`}
      title={t(`county.state.${state || 'absent'}`)} />
  );
}

/** One line of plain Hungarian about where this járás stands. */
function Verdict({ data, d }: { data: ReturnType<typeof useDistricts>; d: DistrictRow }) {
  const branch = useContextStore((s) => s.kind);
  const rate = vacancyRate(d, branch);
  const national = rankOf(data, d.name, (x) => vacancyRate(x, branch));
  const inCounty = rankOf(data, d.name, (x) => vacancyRate(x, branch), d.county);
  const travel = rankOf(data, d.name, (x) => x.medianGpMinutes);
  if (rate === null || !national) return null;
  const half = rate > national.median ? 'worse' : 'better';
  return (
    <p className="district-verdict">
      {t(`district.verdict.${half}`, {
        name: d.name,
        branch: t(`kinds.${branch}.adj`),
        rate: formatPercent(rate),
        art: huArticle(national.rank),
        rank: String(national.rank),
        of: String(national.of),
        median: formatPercent(national.median),
      })}
      {inCounty && inCounty.of > 1 && ` ${t('district.verdict.county', {
        county: d.county,
        art: huArticle(inCounty.rank),
        rank: String(inCounty.rank),
        of: String(inCounty.of),
      })}`}
      {travel && d.medianGpMinutes !== null && ` ${t('district.verdict.travel', {
        n: minutes(d.medianGpMinutes),
        art: huArticle(travel.rank),
        rank: String(travel.rank),
        of: String(travel.of),
      })}`}
    </p>
  );
}

export function DistrictPage() {
  useHashScroll();
  const data = useDistricts();
  const kind = useContextStore((s) => s.kind);
  const setKind = useContextStore((s) => s.setKind);
  const county = useContextStore((s) => s.county);
  const setCounty = useContextStore((s) => s.setCounty);
  const district = useContextStore((s) => s.district);
  const setDistrict = useContextStore((s) => s.setDistrict);
  const [sort, setSort] = useState<SortKey>('band');
  const [ageOn, setAgeOn] = useState<AgeKey | null>(null);
  const [gpOn, setGpOn] = useState<string | null>(null);
  const [dentalOn, setDentalOn] = useState<string | null>(null);

  const d = districtOf(data, district);
  const counties = useMemo(
    () => [...new Set((data?.districts ?? []).map((x) => x.county))].sort(
      (a, b) => a.localeCompare(b, 'hu')),
    [data],
  );
  // the picker lists the járás of the chosen county, or all of them
  const options = useMemo(() => (data?.districts ?? [])
    .filter((x) => !county || x.county === county)
    .sort((a, b) => a.name.localeCompare(b.name, 'hu')), [data, county]);

  const rows = useMemo(() => {
    const list = settlementRows(data, district);
    const by: Record<SortKey, (a: SettlementRow, b: SettlementRow) => number> = {
      name: (a, b) => a.name.localeCompare(b.name, 'hu'),
      population: (a, b) => b.population - a.population,
      band: (a, b) => BAND_ORDER[a.band] - BAND_ORDER[b.band]
        || b.population - a.population,
      gpMin: (a, b) => (b.gpMin ?? -1) - (a.gpMin ?? -1),
      oncallMin: (a, b) => (b.oncallMin ?? -1) - (a.oncallMin ?? -1),
    };
    return [...list].sort(by[sort]);
  }, [data, district, sort]);

  // the map is painted with the branch the reader is looking at
  const values = useMemo(() => new Map(
    (data?.districts ?? [])
      .map((x) => [x.name, vacancyRate(x, kind)] as const)
      .filter((pair): pair is [string, number] => pair[1] !== null),
  ), [data, kind]);

  const pick = (name: string) => {
    const row = districtOf(data, name);
    if (row) setCounty(row.county);
    setDistrict(name);
  };

  const gpSlices = d?.gpDistricts ? [
    { value: d.gpDistricts.total - d.gpDistricts.vacant - d.gpDistricts.dissolved,
      color: '#4fd6c2', label: t('stats.statusFilled') },
    { value: d.gpDistricts.vacant, color: '#ef6461', label: t('stats.statusVacant') },
    { value: d.gpDistricts.dissolved, color: 'var(--line-strong)',
      label: t('stats.statusDissolved') },
  ].filter((s) => s.value > 0) : [];
  const dentalSlices = d?.dentalDistricts ? [
    { value: d.dentalDistricts.total - d.dentalDistricts.vacant
      - d.dentalDistricts.dissolved, color: '#4fd6c2', label: t('stats.statusFilled') },
    { value: d.dentalDistricts.vacant, color: '#ef6461',
      label: t('stats.statusVacant') },
    { value: d.dentalDistricts.dissolved, color: 'var(--line-strong)',
      label: t('stats.statusDissolved') },
  ].filter((s) => s.value > 0) : [];
  const gpActive = gpSlices.find((s) => s.label === gpOn) ?? null;
  const dentalActive = dentalSlices.find((s) => s.label === dentalOn) ?? null;

  return (
    <>
      <PageNav kind={kind} onKind={setKind} />
      <section className="section container" id="jaras">
        <h1 className="section__heading">{t('district.heading')}</h1>
        <p className="section__lead">{t('district.lead')}</p>

        <DistrictMap values={values} selected={district} onPick={pick}
          format={(name, v) => `${name}: ${v === undefined ? '–' : formatPercent(v)}`} />
        <p className="tp-note">{t('district.mapNote', {
          kind: t(`kinds.${kind}.adj`),
        })}</p>

        <div className="district-pickers">
          <label className="county-picker">
            <span>{t('county.pick')}</span>
            <select value={county ?? ''} onChange={(e) => setCounty(e.target.value || null)}>
              <option value="">{t('district.allCounties')}</option>
              {counties.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="county-picker">
            <span>{t('district.pick')}</span>
            <select value={district ?? ''}
              onChange={(e) => (e.target.value ? pick(e.target.value) : setDistrict(null))}>
              <option value="">{t('district.pickNone')}</option>
              {options.map((x) => (
                <option key={x.name} value={x.name}>{x.name}</option>
              ))}
            </select>
          </label>
        </div>

        {!data && <p className="loading">…</p>}
        {data && !d && <p className="section__explain">{t('district.nothingPicked')}</p>}

        {d && (
          <>
            <h2 className="section__subheading" id="allapot">
              {t('district.stateHeading', { name: d.name })}
            </h2>
            <Verdict data={data} d={d} />

            <div className="county-cards">
              <article className="county-card">
                {d.age && (
                  <div className="county-card__figure">
                    <AgePie split={d.age} size={150} hole={44}
                      active={ageOn} onActive={setAgeOn} />
                  </div>
                )}
                <div className="county-card__body">
                  {ageOn && d.age ? (
                    <>
                      <div className="stat__value">{formatNumber(d.age[ageOn])}</div>
                      <div className="stat__label">{t('county.ageOf', {
                        group: t(`age.part.${ageOn}`),
                        share: formatPercent(d.age[ageOn] / d.age.total),
                      })}</div>
                    </>
                  ) : (
                    <>
                      <div className="stat__value">{formatNumber(d.population)}</div>
                      <div className="stat__label">{t('district.population', {
                        n: formatNumber(d.settlements),
                      })}</div>
                    </>
                  )}
                  {d.age && <AgeLegend split={d.age} active={ageOn} onActive={setAgeOn} />}
                  <div className="stat__context">{t('district.seatLine', {
                    seat: d.seat, county: d.county,
                  })}</div>
                </div>
              </article>

              {(['gp', 'dental'] as const).map((branch) => {
                const cell = branch === 'gp' ? d.gpDistricts : d.dentalDistricts;
                const slices = branch === 'gp' ? gpSlices : dentalSlices;
                const active = branch === 'gp' ? gpActive : dentalActive;
                const onActive = branch === 'gp' ? setGpOn : setDentalOn;
                const rate = vacancyRate(d, branch);
                const thin = per10k(d, branch);
                return (
                  <article className="county-card" key={branch}>
                    <div className="county-card__figure">
                      <Donut size={150} thickness={20} slices={slices}
                        active={branch === 'gp' ? gpOn : dentalOn} onActive={onActive}>
                        <strong>{rate === null ? '–' : formatPercent(rate)}</strong>
                      </Donut>
                    </div>
                    <div className="county-card__body">
                      {active ? (
                        <>
                          <div className="stat__value">{formatNumber(active.value)}
                            <span className="stat__of"> / {formatNumber(
                              cell?.total ?? 0)}</span>
                          </div>
                          <div className="stat__label">{t('district.sliceOf', {
                            state: active.label.toLowerCase(),
                            branch: t(`kinds.${branch}.adj`),
                          })}</div>
                        </>
                      ) : (
                        <>
                          <div className="stat__value">
                            {formatNumber((cell?.vacant ?? 0) + (cell?.dissolved ?? 0))}
                            <span className="stat__of"> / {formatNumber(
                              cell?.total ?? 0)}</span>
                          </div>
                          <div className="stat__label">{t('district.vacantOf', {
                            branch: t(`kinds.${branch}.adj`),
                          })}</div>
                        </>
                      )}
                      <DonutLegend slices={slices}
                        active={branch === 'gp' ? gpOn : dentalOn} onActive={onActive} />
                      <div className="stat__context">
                        {cell?.longTerm ? `${t('district.longTerm', {
                          n: formatNumber(cell.longTerm) })} · ` : ''}
                        {thin !== null && t('district.per10k', {
                          n: formatDecimal(thin.toFixed(2)) })}
                      </div>
                    </div>
                  </article>
                );
              })}

              <article className="county-card county-card--wide">
                <div className="county-card__body">
                  <div className="stat__value">{minutes(d.medianGpMinutes)}
                    <span className="stat__of"> · {minutes(d.medianOncallMinutes)}
                      {' · '}{minutes(d.medianInpatientMinutes)}</span>
                  </div>
                  <div className="stat__label">{t('district.travelLabel')}</div>
                  <div className="stat__context">{t('district.accessLine', {
                    bus: formatNumber(d.withoutDirectBus),
                    oncall: formatNumber(d.oncallPoints),
                    ambulance: formatNumber(d.ambulanceStations),
                    pharmacies: formatNumber(d.pharmacies),
                  })}</div>
                </div>
              </article>
            </div>

            <table className="info-table">
              <tbody>
                <tr>
                  <th>{t('county.gpLine')}</th>
                  <td>{t('county.stateLine', {
                    filled: formatNumber(d.gpFilled),
                    partial: formatNumber(d.gpPartial),
                    vacant: formatNumber(d.gpVacantOnly),
                  })}</td>
                </tr>
                <tr>
                  <th>{t('county.dentalLine')}</th>
                  <td>{t('county.stateLine', {
                    filled: formatNumber(d.dentalFilled),
                    partial: formatNumber(d.dentalPartial),
                    vacant: formatNumber(d.dentalVacantOnly),
                  })}{' '}
                    <span className="county-note">{t('county.dentalSeats', {
                      n: formatNumber(d.dentalAbsent),
                    })}</span>
                  </td>
                </tr>
                <tr>
                  <th>{t('county.bandLine')}</th>
                  <td>{t('county.bandValue', {
                    kiemelt: formatNumber(d.bands.kiemelt ?? 0),
                    magas: formatNumber(d.bands.magas ?? 0),
                  })}{d.medianIndex !== null && ` · ${t('district.medianIndex', {
                    n: formatDecimal(d.medianIndex.toFixed(1)),
                  })}`}</td>
                </tr>
              </tbody>
            </table>

            <h2 className="section__subheading" id="rangsor">
              {t('district.rankingHeading')}
            </h2>
            <p className="section__explain">{t('district.rankingExplain', {
              branch: t(`kinds.${kind}.adj`),
            })}</p>
            <DistrictRanking data={data} branch={kind} selected={d.name}
              onPick={pick} />

            <h2 className="section__subheading" id="osszefugges">
              {t('district.scatterHeading')}
            </h2>
            <p className="section__explain">{t('district.scatterExplain')}</p>
            <DistrictScatter data={data} branch={kind} selected={d.name}
              onPick={pick} />

            <h2 className="section__subheading" id="telepulesek">
              {t('district.tableHeading', { name: d.name })}
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
                  <tr key={r.slug} className={r.name === d.seat ? 'is-seat' : undefined}>
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
            <p className="extra-note">{t('district.caveat')}
              {data?.unplaced?.dental ? ` ${t('district.unplaced', {
                n: formatNumber(data.unplaced.dental),
              })}` : ''}
            </p>
          </>
        )}

        <NextSteps items={NEXT} />
      </section>
      <Footer />
    </>
  );
}
