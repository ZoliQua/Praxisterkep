import { t } from '../lib/i18n';
import { formatDuration, formatMonth, formatNumber, formatPercent, monthsBetween } from '../lib/format';
import { longestVacant, medianVacancyMonths, primarySite, SZOMBATHELY_POPULATION } from '../lib/selectors';
import { useAppStore } from '../store/useAppStore';

export function Hero() {
  const snapshot = useAppStore((s) => s.snapshot)!;
  const timeseries = useAppStore((s) => s.timeseries);
  const { national, month, praxes } = snapshot;

  const vacantOnly = praxes.filter((p) => p.status === 'vacant');
  const populationAll = national.populationVacant + national.populationDissolved;
  const median = medianVacancyMonths(praxes, month);
  const longest = longestVacant(praxes);
  const monthCount = timeseries?.months.length ?? 1;

  return (
    <header className="hero container">
      <div className="hero__kicker">{t('site.title')}</div>
      <h1>
        {t('site.subtitle').replace('?', '')}
        <span className="accent">?</span>
      </h1>
      <p className="hero__lead">{t('site.lead')}</p>
      <p className="hero__meta">
        {t('site.lastUpdate')}: {formatMonth(month)}
        {monthCount === 1 && <> · {t('site.firstMonthNote')}</>}
      </p>

      <div className="statgrid">
        <div className="stat">
          <div className="stat__value stat__value--alert">{formatNumber(vacantOnly.length)}</div>
          <div className="stat__label">{t('hero.vacant')}</div>
        </div>
        <div className="stat">
          <div className="stat__value stat__value--soft">{formatNumber(national.dissolved)}</div>
          <div className="stat__label">{t('hero.dissolved')}</div>
        </div>
        <div className="stat">
          <div className="stat__value stat__value--accent">{formatPercent(national.vacancyRate)}</div>
          <div className="stat__label">{t('hero.vacancyRate')}</div>
        </div>
        <div className="stat">
          <div className="stat__value">{formatNumber(populationAll)}</div>
          <div className="stat__label">{t('hero.populationAffected')}</div>
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
