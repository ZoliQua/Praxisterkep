// "Mi várható egy év múlva?" — the vacancy forecast.
//
// Two analyses on this page already hold half the answer each: the risk
// model (who loses a doctor next) and the survival curves (how fast a
// vacancy fills). Their sum is a flow forecast for the country, every county
// and every járás, with a band and a back-test against the archive. It is
// shown as a path over the next twelve months, a now-and-later line per
// county, and a map.
import { useState } from 'react';
import { t } from '../lib/i18n';
import { formatDecimal, formatMonth, formatNumber, formatPercent } from '../lib/format';
import { districtHref, useOutcomes } from '../lib/outcomes';
import { contextHref, currentContext } from '../lib/context';
import { DistrictMap } from './charts/DistrictMap';
import { Dumbbell } from './charts/Dumbbell';
import { ForecastPath } from './charts/ForecastPath';

type Kind = 'gp' | 'dental';

export function ForecastSection({ kind: initial }: { kind: Kind }) {
  const o = useOutcomes();
  const [kind, setKind] = useState<Kind>(initial);
  const [county, setCounty] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  if (!o) return null;
  const f = o.forecast.kinds[kind];
  const n = f.national;
  const c = county ? f.counties[county] : null;
  const fmt1 = (v: number) => formatDecimal(v.toFixed(1));
  const bt = f.backtest;
  const rate = (v: number | null) => (v === null ? '–' : formatPercent(v));
  const mapValues = new Map(Object.entries(f.districts)
    .filter(([, d]) => d.rateIn12 !== null && d.districts > 0)
    .map(([name, d]) => [name, d.rateIn12 as number]));

  return (
    <section className="section container outcome" id="elorejelzes">
      <h2 className="section__heading">{t('outcomes.forecast.heading')}</h2>
      <div className="seg outcome__switch" role="group">
        {(['gp', 'dental'] as const).map((k) => (
          <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>
            {t(`outcomes.grants.kind.${k}`)}
          </button>
        ))}
      </div>
      <p className="section__lead">{t('outcomes.forecast.lead', {
        month: formatMonth(f.month), now: formatNumber(n.vacantNow),
        later: fmt1(n.vacantIn12), lo: fmt1(n.vacantIn12Band[0]), hi: fmt1(n.vacantIn12Band[1]),
        add: fmt1(n.expectedNew), fill: fmt1(n.expectedRefills),
        rateNow: rate(n.rateNow), rateLater: rate(n.rateIn12),
      })}</p>

      <div className="outcome__pair">
        <div>
          <h3 className="outcome__sub">{county
            ? t('outcomes.forecast.pathCounty', { county }) : t('outcomes.forecast.pathHeading')}</h3>
          <ForecastPath start={f.month}
            path={c ? c.path : n.path} band={c ? c.vacantIn12Band : n.vacantIn12Band} />
          {c && (
            <p className="outcome__hint">{t('outcomes.forecast.countyLine', {
              now: formatNumber(c.vacantNow), later: fmt1(c.vacantIn12),
              add: fmt1(c.expectedNew), fill: fmt1(c.expectedRefills),
            })} <button type="button" className="linklike" onClick={() => setCounty(null)}>
              {t('outcomes.forecast.backToCountry')}</button></p>
          )}
          {bt && (
            <div className="outcome__backtest">
              <h4>{t('outcomes.forecast.backtestHeading', {
                from: formatMonth(bt.from), to: formatMonth(bt.to), months: bt.months })}</h4>
              {([['new', bt.newPredicted, bt.newActual], ['refills', bt.refillsPredicted, bt.refillsActual]] as const)
                .map(([k, pred, act]) => {
                  const top = Math.max(pred, act, 1);
                  return (
                    <div key={k} className="backtest__row">
                      <span>{t(`outcomes.forecast.backtest.${k}`)}</span>
                      <span className="backtest__bars">
                        <i className="is-pred" style={{ width: `${(pred / top) * 100}%` }}
                          title={t('outcomes.forecast.predicted', { v: fmt1(pred) })} />
                        <i className="is-act" style={{ width: `${(act / top) * 100}%` }}
                          title={t('outcomes.forecast.actual', { v: formatNumber(act) })} />
                      </span>
                      <b>{fmt1(pred)} / {formatNumber(act)}</b>
                    </div>
                  );
                })}
              <p className="outcome__hint">{t('outcomes.forecast.backtestNote')}</p>
            </div>
          )}
        </div>
        <div>
          <h3 className="outcome__sub">{t('outcomes.forecast.countiesHeading')}</h3>
          <Dumbbell
            rows={Object.entries(f.counties).filter(([, x]) => x.rateNow !== null && x.rateIn12 !== null)
              .map(([name, x]) => ({ key: name, label: name, from: x.rateNow as number,
                to: x.rateIn12 as number,
                href: contextHref('megye.html', { ...currentContext(), county: name }) }))
              .sort((a, b) => b.to - a.to)}
            format={(v) => formatPercent(v)} fromLabel={t('outcomes.forecast.now')}
            toLabel={t('outcomes.forecast.later')} selected={county} onPick={setCounty} />
        </div>
      </div>

      <h3 className="outcome__sub">{t('outcomes.forecast.mapHeading')}</h3>
      <DistrictMap values={mapValues} selected={picked} onPick={(name) => {
        setPicked(name); window.location.href = districtHref(name);
      }} legendFormat={(v) => formatPercent(v)} total={o.districts.length} color="#ef6461"
        scale={{ domain: 'spread' }}
        seatOf={(name) => o.districts.find((d) => d.name === name)?.county} />
      <p className="notice">{t('outcomes.forecast.caveat', {
        auc: f.riskValidation ? formatDecimal(f.riskValidation.auc.toFixed(2)) : '–' })}</p>
      <p className="section__source">{t('outcomes.forecast.source')}</p>
    </section>
  );
}
