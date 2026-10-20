// "Négy keresztmetszet" — what the existing data says when it is read
// against itself: how long a vacancy lasts against how far the next doctor
// is, against how old the village is, against whether a bus goes there, and
// the contiguous care deserts. No new source is behind any of it.
import { useMemo } from 'react';
import { t } from '../lib/i18n';
import { formatDecimal, formatDuration, formatNumber } from '../lib/format';
import { contextHref, currentContext } from '../lib/context';
import { useOutcomes } from '../lib/outcomes';
import { OutcomeScatter, type ScatterPoint } from './charts/OutcomeScatter';

const BANDS = [[0, 24], [24, 60], [60, 120], [120, 10000]] as const;

function median(v: number[]): number | null {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b); const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function settlementHref(slug: string): string {
  return contextHref(`/telepules/${slug}/`, currentContext());
}

/** The four readings for the whole country, or — on a county or a járás
 *  page — for that area's own settlements. */
export function CrossSection({ area }: { area?: { level: 'county' | 'district'; name: string } }) {
  const o = useOutcomes();
  const pts = useMemo(() => (o?.cross.durationTravel ?? [])
    .filter((p) => !area || p[area.level] === area.name), [o, area]);
  const bands = useMemo(() => BANDS.map(([lo, hi]) => {
    const b = pts.filter((p) => p.months >= lo && p.months < hi && p.minutes !== null);
    return { lo, hi, n: b.length, minutes: median(b.map((p) => p.minutes as number)),
      noBus: b.filter((p) => p.bus === false).length };
  }), [pts]);
  if (!o) return null;
  const local = area ? o.cross.areas[`${area.level}:${area.name}`] : null;
  if (area && !local) return null;
  // all four readings count settlements served by vacant districts only;
  // where an area has none (a kerület, a well-served járás) every card would
  // read zero, which says nothing — the section is left out
  if (local && !pts.length && !local.bus.vacantOnly && !local.deserts.settlements
    && local.ageBands.every((b) => !b.vacantOnly)) return null;
  const c = { ...o.cross, ...(local ? { ageBands: local.ageBands, bus: local.bus } : {}) };
  const scatter: ScatterPoint[] = pts.filter((p) => p.minutes !== null).map((p) => ({
    id: p.slug, label: p.name, sub: `${p.county} · ${formatDuration(p.months)}`,
    x: p.months / 12, y: p.minutes as number, size: p.population,
    group: p.bus === false ? 0 : p.state === 'vacantOnly' ? 1 : 2,
  }));
  const maxBand = Math.max(...bands.map((b) => b.minutes ?? 0), 1);
  const ageMax = Math.max(0.01, ...c.ageBands.map((b) => b.vacantOnly / b.settlements));
  const d = c.deserts.stats ?? {};

  return (
    <section className={area ? 'outcome cross-local' : 'section container outcome'} id="keresztmetszet">
      {area ? (
        <>
          <h2 className="section__subheading">{t('outcomes.cross.localHeading', { name: area.name })}</h2>
          <p className="section__explain">{t('outcomes.cross.localLead')}</p>
        </>
      ) : (
        <>
          <h2 className="section__heading">{t('outcomes.cross.heading')}</h2>
          <p className="section__lead">{t('outcomes.cross.lead')}</p>
        </>
      )}

      <div className="cross-grid">
        <article className="cross-card cross-card--wide">
          <h3>{t('outcomes.cross.durationHeading')}</h3>
          <p>{t('outcomes.cross.durationText', { n: formatNumber(pts.length) })}</p>
          <div className="bandbars">
            {bands.map((b, i) => (
              <div key={i} className="bandbars__row">
                <span className="bandbars__label">{t(`outcomes.cross.band${i}`)}</span>
                <span className="bandbars__bar">
                  <i style={{ width: `${(100 * (b.minutes ?? 0)) / maxBand}%` }} />
                </span>
                <b>{b.minutes === null ? '–' : `${formatDecimal(b.minutes.toFixed(1))} ${t('outcomes.min')}`}</b>
                <small>{t('outcomes.cross.bandN', { n: b.n })}</small>
              </div>
            ))}
          </div>
          <OutcomeScatter points={scatter}
            xLabel={t('outcomes.cross.xYears')} yLabel={t('outcomes.cross.yMinutes')}
            xFormat={(v) => `${Math.round(v)} ${t('outcomes.yr')}`}
            yFormat={(v) => `${Math.round(v)} ${t('outcomes.min')}`}
            groupLabels={[t('outcomes.cross.gNoBus'), t('outcomes.cross.gOnly'), t('outcomes.cross.gPartial')]}
            onPick={(slug) => { window.location.href = settlementHref(slug); }} />
        </article>

        <article className="cross-card">
          <h3>{t('outcomes.cross.ageHeading')}</h3>
          <p>{t('outcomes.cross.ageText')}</p>
          <div className="agebars">
            {c.ageBands.map((b) => {
              const share = b.vacantOnly / b.settlements;
              return (
                <div key={b.from} className="agebars__col" title={t('outcomes.cross.ageTitle', {
                  from: b.from, to: b.to, n: b.settlements, share: Math.round(100 * share) })}>
                  <span className="agebars__val">{Math.round(100 * share)}%</span>
                  <span className="agebars__bar" style={{ height: `${(100 * share) / ageMax}%` }}
                    data-small={b.settlements < 30 ? 'true' : undefined} />
                  <span className="agebars__lab">{b.from}–{b.to}%</span>
                  <small>n={b.settlements}</small>
                </div>
              );
            })}
          </div>
          <p className="outcome__hint">{t('outcomes.cross.ageNote')}</p>
        </article>

        <article className="cross-card">
          <h3>{t('outcomes.cross.busHeading')}</h3>
          <p className="cross-card__big">
            <b>{formatNumber(c.bus.noDirectBus)}</b>
            <span>{t('outcomes.cross.busBig', {
              people: formatNumber(c.bus.noDirectBusPopulation),
              of: formatNumber(c.bus.vacantOnly),
            })}</span>
          </p>
          <ul className="cross-card__list">
            {c.bus.stranded.slice(0, 10).map((s) => (
              <li key={s.slug}>
                <a href={settlementHref(s.slug)}>{s.name}</a>
                <span>{formatNumber(s.population)} {t('outcomes.people')}</span>
                <small>{formatDuration(s.months)}</small>
              </li>
            ))}
          </ul>
        </article>

        <article className="cross-card cross-card--wide cross-card--row">
          <h3>{t('outcomes.cross.desertHeading')}</h3>
          {local ? (
            <p className="cross-card__big">
              <b>{formatNumber(local.deserts.settlements)}</b>
              <span>{local.deserts.settlements
                ? t('outcomes.cross.desertLocal', {
                  people: formatNumber(local.deserts.population),
                  clusters: formatNumber(local.deserts.clusters), of: formatNumber(local.settlements) })
                : t('outcomes.cross.desertNone')}</span>
            </p>
          ) : (
            <>
              <p className="cross-card__big">
                <b>{formatNumber(d.clusters ?? 0)}</b>
                <span>{t('outcomes.cross.desertBig', {
                  settlements: formatNumber(d.settlementsInClusters ?? 0),
                  people: formatNumber(d.populationInClusters ?? 0),
                })}</span>
              </p>
              <p>{t('outcomes.cross.desertText', {
                isolated: formatNumber(d.isolated ?? 0),
                isolatedPeople: formatNumber(d.isolatedPopulation ?? 0),
              })}</p>
            </>
          )}
          <a className="cross-card__more" href={area ? '/elemzo.html#hianyteruletek' : '#hianyteruletek'}>
            {t('outcomes.cross.desertMore')}</a>
        </article>
      </div>
    </section>
  );
}
