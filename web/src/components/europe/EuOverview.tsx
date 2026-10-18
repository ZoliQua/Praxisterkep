// The page's opening: one card per headline measure, saying where the
// country in focus stands among the countries picked — its value and year,
// its place, the EU figure, and every other country as a dot on the same
// line. A card opens its section with that measure chosen.
import { t } from '../../lib/i18n';
import {
  formatValue, goodness, profile, ranking, reference, standing, type EuSection,
} from '../../lib/europe';
import type { EuView } from './IndicatorSection';
import { EuProfile } from './EuProfile';

const HEADLINES: Record<'gp' | 'dental', string[]> = {
  gp: ['gpDensity', 'physicians55', 'gpVisit', 'unmetMed', 'screenCervical', 'flu65',
    'avoidable', 'outOfPocket'],
  dental: ['dentistDensity', 'physicians55', 'dentVisit', 'unmetDent', 'dentConsultations',
    'dentalPractices', 'avoidable', 'outOfPocket'],
};

export function EuOverview({ view, onOpen }: {
  view: EuView;
  onOpen: (section: EuSection, indicator: string) => void;
}) {
  const { raw, kind, members, focus, nameOf, onFocus } = view;
  return (
    <section className="section container eu-section" id="attekintes">
      <h2 className="section__heading">{t('europe.overview.heading', { country: nameOf(focus) })}</h2>
      <p className="section__lead">{t('europe.overview.lead')}</p>
      <div className="eu-cards">
        {HEADLINES[kind].filter((k) => raw.indicators[k]).map((k) => {
          const ind = raw.indicators[k];
          const rows = ranking(ind, members);
          const st = standing(rows, focus);
          const mine = rows.find((r) => r.geo === focus);
          const ref = reference(ind, rows);
          const live = rows.filter((r) => !r.stale);
          const lo = Math.min(...live.map((r) => r.value));
          const hi = Math.max(...live.map((r) => r.value));
          const fmt = (v: number) => formatValue(ind.unit, v);
          const pos = (v: number) => `${hi > lo ? ((v - lo) / (hi - lo)) * 100 : 50}%`;
          const g = mine && !mine.stale && ind.better !== 'neutral' ? goodness(ind.better, mine.value, lo, hi) : null;
          const tone = g === null ? '' : g < 1 / 3 ? ' is-bad' : g > 2 / 3 ? ' is-good' : ' is-mid';
          return (
            <button type="button" key={k} className={`eu-card${tone}`}
              onClick={() => onOpen(ind.section, k)}>
              <span className="eu-card__name">{t(`europe.ind.${k}.short`)}</span>
              <span className="eu-card__value">
                {mine ? fmt(mine.value) : '–'}
                {mine && <small>{mine.year}</small>}
              </span>
              <span className="eu-card__rank">
                {st ? t('europe.overview.rank', { rank: st.rank, of: st.of })
                  : mine?.stale ? t('europe.stale')
                    : mine && ind.better === 'neutral' ? t('europe.overview.unranked') : t('europe.noData')}
              </span>
              <span className="eu-card__strip" aria-hidden="true">
                {live.map((r) => (
                  <i key={r.geo} style={{ left: pos(r.value) }}
                    className={r.geo === focus ? 'is-focus' : r.geo === 'HU' ? 'is-hu' : ''}
                    title={`${nameOf(r.geo)}: ${fmt(r.value)}`}
                    onClick={(e) => { e.stopPropagation(); onFocus(r.geo); }} />
                ))}
                {ref && ref.value >= lo && ref.value <= hi && <em style={{ left: pos(ref.value) }} />}
              </span>
              <span className="eu-card__ref">
                {ref ? t(ref.kind === 'eu' ? 'europe.refEu' : 'europe.refMedian', { value: fmt(ref.value), year: ref.year }) : ''}
              </span>
            </button>
          );
        })}
      </div>
      <p className="outcome__hint">{t('europe.overview.hint')}</p>
      <h3 className="outcome__sub">{t('europe.profile.heading', { country: nameOf(focus) })}</h3>
      <p className="section__explain">{t('europe.profile.explain')}</p>
      <EuProfile rows={profile(raw, kind, members, focus)} onOpen={onOpen} />
    </section>
  );
}
