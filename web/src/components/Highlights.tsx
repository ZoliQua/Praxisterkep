// Two findings from the analysis page, on the landing: one for each branch,
// each new — something the monthly lists alone do not say — and each a link
// to the section that shows how it was made.
import { useEffect, useState } from 'react';
import { t } from '../lib/i18n';
import { formatNumber, formatPercent } from '../lib/format';
import { contextHref } from '../lib/context';
import { EuropeHighlights } from './EuropeHighlights';

interface HighlightsData {
  month: string;
  gp: { grantsFilled: number; matchedFilled: number; pairs: number };
  dental: { vacant: number; tenYears: number };
}

export function Highlights() {
  const [data, setData] = useState<HighlightsData | null>(null);
  useEffect(() => {
    let alive = true;
    void fetch(`${import.meta.env.BASE_URL}data/highlights.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: HighlightsData | null) => { if (alive) setData(d); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  if (!data) return null;
  const { gp, dental } = data;
  return (
    <section className="section container highlights" aria-label={t('highlights.heading')}>
      <h2 className="section__subheading">{t('highlights.heading')}</h2>
      <div className="highlights__grid">
        <a className="highlight" href={contextHref('/elemzo.html#tamogatasok')}>
          <span className="highlight__kind">{t('kinds.gp.label')}</span>
          <span className="highlight__numbers">
            <b>{formatPercent(gp.grantsFilled, 0)}</b>
            <span className="highlight__vs">{t('highlights.vs')}</span>
            <b className="is-dim">{formatPercent(gp.matchedFilled, 0)}</b>
          </span>
          <span className="highlight__text">{t('highlights.gp', { pairs: formatNumber(gp.pairs) })}</span>
          <span className="highlight__more">{t('highlights.more')}</span>
        </a>
        <a className="highlight" href={contextHref('/elemzo.html#tulel')}>
          <span className="highlight__kind">{t('kinds.dental.label')}</span>
          <span className="highlight__numbers">
            <b>{formatNumber(dental.tenYears)}</b>
            <span className="highlight__vs">/ {formatNumber(dental.vacant)}</span>
          </span>
          <span className="highlight__text">{t('highlights.dental', {
            share: formatPercent(dental.tenYears / dental.vacant, 0) })}</span>
          <span className="highlight__more">{t('highlights.more')}</span>
        </a>
      </div>
      <EuropeHighlights />
    </section>
  );
}
