import { t } from '../lib/i18n';
import { formatMonth } from '../lib/format';
import { useAppStore, useSnapshot, useTimeseriesMonths } from '../store/useAppStore';
import { HeroShowcase } from './HeroShowcase';
import type { PraxisKind } from '../types';

export function Hero() {
  const snapshot = useSnapshot()!;
  const kind = useAppStore((s) => s.kind);
  const setKind = useAppStore((s) => s.setKind);
  const monthCount = useTimeseriesMonths().length;

  return (
    <header className="hero container">
      <div className="hero__kicker">{t('site.title')}</div>
      <h1>
        {t(`kinds.${kind}.question`).replace('?', '')}
        <span className="accent">?</span>
      </h1>
      <div className="seg seg--kind" role="group">
        {(['dental', 'gp'] as PraxisKind[]).map((k) => (
          <button key={k} aria-pressed={kind === k} onClick={() => setKind(k)}>
            {t(`kinds.${k}.label`)}
          </button>
        ))}
      </div>
      <p className="hero__lead">{t('site.lead')}</p>
      <p className="hero__meta">
        {t('site.lastUpdate')}: {formatMonth(snapshot.month)}
        {monthCount === 1 && <> · {t('site.firstMonthNote')}</>}
      </p>

      <HeroShowcase />

      <p className="notice">{t('hero.vacantVsUnserved')}</p>
    </header>
  );
}
