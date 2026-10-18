// Doctors on the move: where the doctors working in the country in focus
// were trained, and where the doctors it trained now work — as far as the
// destinations report it. The OECD counts by place of training, not by
// nationality, so a country that teaches many foreign students "sends" them
// home on paper; the note under the chart says so, and nothing is netted.
import { useMemo } from 'react';
import { locale, t } from '../../lib/i18n';
import { formatNumber, formatPercent } from '../../lib/format';
import { EuMap } from './EuMap';
import type { EuView } from './IndicatorSection';

const regionNames = typeof Intl !== 'undefined' && 'DisplayNames' in Intl
  ? new Intl.DisplayNames([locale], { type: 'region' }) : null;

export function EuMigration({ view }: { view: EuView }) {
  const { raw, geo, focus, onFocus, nameOf } = view;
  const carried = useMemo(() => new Set(raw.countries), [raw]);
  // a country the page carries goes by its own name; any other by the
  // browser's, in the page's language (UK and EL are Eurostat's codes)
  const name = (code: string) => (carried.has(code) ? nameOf(code)
    : regionNames?.of(code) ?? code);
  const inflow = raw.migration.inflow[focus];
  const outflow = raw.migration.outflow[focus];
  const dests = outflow?.destinations ?? [];
  const destMap = new Map(dests.map(([g, y, n]) => [g, { value: n, year: y }]));
  const frame = useMemo(() => new Set(raw.countries), [raw]);
  const maxIn = inflow ? Math.max(...inflow.origins.map((o) => o[1]), inflow.other, 1) : 1;
  const maxOut = Math.max(...dests.map((d) => d[2]), 1);
  const newestOut = dests.reduce((a, d) => (d[1] > a ? d[1] : a), '');

  return (
    <section className="section container eu-section" id="vandorlas">
      <h2 className="section__heading">{t('europe.migration.heading', { country: nameOf(focus) })}</h2>
      <p className="section__lead">{t('europe.migration.lead')}</p>
      <div className="eu-pair">
        <div>
          <h3 className="outcome__sub">{t('europe.migration.inHeading')}</h3>
          {inflow ? (
            <>
              <div className="eu-mig__split" title={t('europe.migration.splitTitle')}>
                {inflow.domestic !== null && (
                  <i className="is-home" style={{ flex: inflow.domestic }}>
                    {t('europe.migration.home', { n: formatNumber(inflow.domestic) })}</i>
                )}
                <i className="is-abroad" style={{ flex: Math.max(inflow.foreign, 1) }}>
                  {formatNumber(inflow.foreign)}</i>
              </div>
              <p className="section__explain">{t('europe.migration.inSummary', {
                year: inflow.year, n: formatNumber(inflow.foreign),
                share: inflow.domestic !== null
                  ? formatPercent(inflow.foreign / (inflow.foreign + inflow.domestic), 1) : '–' })}</p>
              <ol className="eu-mig__bars">
                {inflow.origins.map(([code, n]) => (
                  <li key={code}><span>{name(code)}</span>
                    <span className="eu-mig__track"><i style={{ width: `${(n / maxIn) * 100}%` }} /></span>
                    <b>{formatNumber(n)}</b></li>
                ))}
                {inflow.other > 0 && (
                  <li className="is-other"><span>{t('europe.migration.other')}</span>
                    <span className="eu-mig__track"><i style={{ width: `${(inflow.other / maxIn) * 100}%` }} /></span>
                    <b>{formatNumber(inflow.other)}</b></li>
                )}
              </ol>
            </>
          ) : <p className="section__explain">{t('europe.migration.noIn')}</p>}
        </div>
        <div>
          <h3 className="outcome__sub">{t('europe.migration.outHeading')}</h3>
          {dests.length ? (
            <>
              <p className="section__explain">{t('europe.migration.outSummary', {
                n: formatNumber(outflow!.total), places: dests.length,
                home: outflow!.home !== null ? formatNumber(outflow!.home) : '–' })}</p>
              {geo && (
                <EuMap shapes={geo.countries.filter((c) => c.carried)} base={geo.countries.filter((c) => !c.carried)}
                  frame={frame} better="neutral" focus={focus} onPick={onFocus} nameOf={nameOf}
                  format={(v) => formatNumber(Math.round(v))} attribution={geo.attribution}
                  legendKey="europe.migration.mapAria"
                  valueOf={(g) => destMap.get(g) ?? null} />
              )}
              <ol className="eu-mig__bars">
                {dests.slice(0, 12).map(([code, year, n]) => (
                  <li key={code}><span>{name(code)}</span>
                    <span className="eu-mig__track"><i className="is-out" style={{ width: `${(n / maxOut) * 100}%` }} /></span>
                    <b>{formatNumber(n)} <small>{year !== newestOut ? year : ''}</small></b></li>
                ))}
              </ol>
            </>
          ) : <p className="section__explain">{t('europe.migration.noOut')}</p>}
        </div>
      </div>
      <p className="eu-note">{t('europe.migration.note')}</p>
      <p className="section__source">{t('europe.source.oecd', { dataset: raw.migration.dataset,
        fetched: raw.fetched['oecd:wfmi'] ?? '' })}{' '}
        <a href="https://data-explorer.oecd.org/" target="_blank" rel="noopener noreferrer">{t('europe.source.open')}</a></p>
    </section>
  );
}
