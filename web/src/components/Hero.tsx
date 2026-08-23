import { t, tKind } from '../lib/i18n';
import { formatDuration, formatMonth, formatNumber, formatPercent, monthsBetween } from '../lib/format';
import { longestVacant, medianVacancyMonths, primarySite, SZOMBATHELY_POPULATION } from '../lib/selectors';
import { useAppStore, useSnapshot, useTimeseriesMonths } from '../store/useAppStore';
import type { PraxisKind } from '../types';

export function Hero() {
  const snapshot = useSnapshot()!;
  const kind = useAppStore((s) => s.kind);
  const setKind = useAppStore((s) => s.setKind);
  const monthCount = useTimeseriesMonths().length;
  const { national, month, praxes } = snapshot;

  const vacantOnly = praxes.filter((p) => p.status === 'vacant');
  const populationAll = national.populationVacant + national.populationDissolved;
  const median = medianVacancyMonths(praxes, month);
  const longest = longestVacant(praxes);

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
        {t('site.lastUpdate')}: {formatMonth(month)}
        {monthCount === 1 && <> · {t('site.firstMonthNote')}</>}
      </p>

      <div className="statgrid">
        <div className="stat">
          <div className="stat__value stat__value--alert">{formatNumber(vacantOnly.length)}</div>
          <div className="stat__label">{tKind('hero.vacant', kind)}</div>
        </div>
        {national.dissolved > 0 && (
          <div className="stat">
            <div className="stat__value stat__value--soft">{formatNumber(national.dissolved)}</div>
            <div className="stat__label">{t('hero.dissolved')}</div>
          </div>
        )}
        <div className="stat">
          <div className="stat__value stat__value--accent">{formatPercent(national.vacancyRate ?? 0)}</div>
          <div className="stat__label">{tKind('hero.vacancyRate', kind)}</div>
        </div>
        <div className="stat">
          <div className="stat__value">{formatNumber(populationAll)}</div>
          <div className="stat__label">{tKind('hero.populationAffected', kind)}</div>
          <div className="stat__context">
            {t('hero.populationContext', {
              count: (populationAll / SZOMBATHELY_POPULATION).toFixed(1).replace('.', ','),
            })}
          </div>
        </div>
        <div className="stat">
          <div className="stat__value">{formatDuration(median)}</div>
          <div className="stat__label">{t('hero.medianVacancy')}</div>
        </div>
        {longest && (
          <div className="stat">
            <div className="stat__value">
              {formatDuration(monthsBetween(longest.vacantSince, month))}
            </div>
            <div className="stat__label">
              {t('hero.longestVacancy')}: {primarySite(longest)?.settlement} (
              {formatMonth(longest.vacantSince)} {t('hero.since')})
            </div>
          </div>
        )}
      </div>

      <p className="notice">{t('hero.vacantVsUnserved')}</p>
    </header>
  );
}
