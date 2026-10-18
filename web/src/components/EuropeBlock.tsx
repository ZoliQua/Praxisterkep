// "Hol áll Magyarország Európában?" — Eurostat's national series beside the
// EU-27, with NNGYK's own national figure in Eurostat's split next to it.
//
// The two sources are kept apart on purpose. Eurostat answers for the
// country against Europe; NNGYK answers inside the country, by járás. Their
// levels differ (see the note), so the page never draws one line from both.
import { useState } from 'react';
import { t } from '../lib/i18n';
import { formatDecimal, formatNumber } from '../lib/format';
import type { OutcomesRaw } from '../lib/outcomes';
import { TrendLines } from './charts/TrendLines';

const KEYS = ['avoidable', 'treatable', 'preventable'] as const;

export function EuropeBlock({ o }: { o: OutcomesRaw }) {
  const [key, setKey] = useState<(typeof KEYS)[number]>('avoidable');
  const e = o.europe;
  const years = e.years;
  const hu = years.map((y) => e.series.hu[key][y] ?? null);
  const eu = years.map((y) => e.series.eu[key][y] ?? null);
  const last = years[years.length - 1];
  const huLast = e.series.hu[key][last];
  const euLast = e.series.eu[key][last];
  const n = e.nngyk;
  const nngykValue = key === 'avoidable' ? n.avoidable : key === 'treatable' ? n.treatableEU : n.preventableEU;
  return (
    <div className="europe">
      <h3 className="outcome__sub">{t('outcomes.europe.heading')}</h3>
      <div className="seg outcome__switch" role="group">
        {KEYS.map((k) => (
          <button key={k} type="button" aria-pressed={key === k} onClick={() => setKey(k)}>
            {t(`outcomes.europe.key.${k}`)}
          </button>
        ))}
      </div>
      <div className="outcome__pair">
        <div>
          <TrendLines labels={years} series={[{ key: 'hu', label: t('outcomes.europe.hu'), values: hu }]}
            reference={{ key: 'eu', label: t('outcomes.europe.eu'), values: eu }}
            focus="hu" format={(v) => formatNumber(Math.round(v))} />
        </div>
        <div className="europe__facts">
          <p className="europe__big"><b>{formatDecimal((huLast / euLast).toFixed(1))}×</b>
            <span>{t('outcomes.europe.ratio', { year: last, hu: formatNumber(Math.round(huLast)),
              eu: formatNumber(Math.round(euLast)), what: t(`outcomes.europe.key.${key}`).toLowerCase() })}</span></p>
          <p>{t('outcomes.europe.nngyk', { year: n.year, value: formatNumber(Math.round(nngykValue)) })}</p>
          <p className="outcome__hint">{t('outcomes.europe.note')}</p>
        </div>
      </div>
      <p className="section__source">{t('outcomes.europe.source')}{' '}
        <a href={e.sourceUrl} target="_blank" rel="noopener noreferrer">Eurostat hlth_cd_apr</a></p>
    </div>
  );
}
