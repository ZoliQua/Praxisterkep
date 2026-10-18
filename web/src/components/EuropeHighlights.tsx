// Two European facts on the landing, one per branch, each a measure on
// which Hungary stands near the bottom of its region — computed by the ETL
// from europe.json (europe_summary.json), never typed into the copy.
import { useEffect, useState } from 'react';
import { t } from '../lib/i18n';
import { contextHref } from '../lib/context';
import { formatValue, type EuUnit } from '../lib/europe';

interface Fact {
  key: string; unit: EuUnit; year: string; value: number; rank: number; of: number; median: number;
  eu: { year: string; value: number } | null;
  best: { geo: string; value: number; year: string };
  rural?: { year: string; value: number };
}
interface Summary { facts: { gp: Fact; dental: Fact } }

export function EuropeHighlights() {
  const [data, setData] = useState<Summary | null>(null);
  useEffect(() => {
    let alive = true;
    void fetch(`${import.meta.env.BASE_URL}data/europe_summary.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Summary | null) => { if (alive) setData(d); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  if (!data) return null;
  const { gp, dental } = data.facts;
  const f = (x: Fact, v: number) => formatValue(x.unit, v);
  return (
    <div className="highlights__europe">
      <h3 className="highlights__subheading">{t('highlights.europe.heading')}</h3>
      <div className="highlights__grid">
        <a className="highlight" href={contextHref('/europa.html?orszagok=cee#munkaero')}>
          <span className="highlight__kind">{t('kinds.gp.label')} · {t('highlights.europe.kicker')}</span>
          <span className="highlight__numbers">
            <b>{f(gp, gp.value)}</b>
            <span className="highlight__vs">{t('highlights.vs')}</span>
            <b className="is-dim">{f(gp, gp.median)}</b>
          </span>
          <span className="highlight__text">{t('highlights.europe.gp', {
            year: gp.year, rank: gp.rank, of: gp.of,
            best: t(`europe.country.${gp.best.geo}`), bestValue: f(gp, gp.best.value) })}</span>
          <span className="highlight__more">{t('highlights.europe.more')}</span>
        </a>
        <a className="highlight" href={contextHref('/europa.html?orszagok=cee#hozzaferes')}>
          <span className="highlight__kind">{t('kinds.dental.label')} · {t('highlights.europe.kicker')}</span>
          <span className="highlight__numbers">
            <b>{f(dental, dental.value)}</b>
            <span className="highlight__vs">{t('highlights.vs')}</span>
            <b className="is-dim">{dental.eu ? f(dental, dental.eu.value) : f(dental, dental.median)}</b>
          </span>
          <span className="highlight__text">{t(dental.eu ? 'highlights.europe.dental' : 'highlights.europe.dentalMedian', {
            year: dental.year, rank: dental.rank, of: dental.of,
            rural: dental.rural ? f(dental, dental.rural.value) : '–' })}</span>
          <span className="highlight__more">{t('highlights.europe.more')}</span>
        </a>
      </div>
    </div>
  );
}
