// Scroll-driven national story between the hero and the map: a sticky
// stage whose number/visual reacts to the step currently in view
// (holadelej-style). Every figure and every shape is derived from the
// sourced snapshot + counties.geojson, so the visuals follow the data
// (worst county, longest-vacant district) as it changes month to month.
import { useEffect, useMemo, useRef, useState } from 'react';
import { t, tKind } from '../lib/i18n';
import { formatDuration, formatMonth, formatNumber, formatPercent, monthsBetween } from '../lib/format';
import { longestVacant, primarySite } from '../lib/selectors';
import { useAppStore, useSnapshot } from '../store/useAppStore';
import { CountryFill, CountyShape, useCountryShapes } from './CountryShapes';

export function ScrollyIntro() {
  const snapshot = useSnapshot()!;
  const kind = useAppStore((s) => s.kind);
  const shapes = useCountryShapes();
  const [active, setActive] = useState(0);
  const stepRefs = useRef<(HTMLDivElement | null)[]>([]);

  // vacant only — the hero's headline number (dissolved is shown separately)
  const vacant = snapshot.national.vacant;
  const popAll = snapshot.national.populationVacant + snapshot.national.populationDissolved;
  const worst = useMemo(() => [...snapshot.counties]
    .filter((c) => c.total)
    .sort((a, b) => (b.vacant + b.dissolved) / b.total! - (a.vacant + a.dissolved) / a.total!)[0],
  [snapshot]);
  const longest = useMemo(() => longestVacant(snapshot.praxes), [snapshot]);
  const longestSite = longest ? primarySite(longest) : null;

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            const i = stepRefs.current.indexOf(e.target as HTMLDivElement);
            if (i >= 0) setActive(i);
          }
        }
      },
      { rootMargin: '-40% 0px -40% 0px' },
    );
    stepRefs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, [kind]);

  const worstRate = worst ? (worst.vacant + worst.dissolved) / worst.total! : null;
  const stage = [
    {
      value: formatNumber(vacant),
      label: tKind('intro.step1Label', kind),
      viz: shapes && (
        <CountryFill shapes={shapes} pct={snapshot.national.vacancyRate}
          color="var(--alert)"
          label={snapshot.national.vacancyRate !== null
            ? formatPercent(snapshot.national.vacancyRate)
            : undefined} />
      ),
    },
    {
      value: formatNumber(popAll),
      label: tKind('intro.step2Label', kind),
      viz: shapes && (
        <CountryFill shapes={shapes}
          pct={snapshot.national.populationShare ?? null}
          color="var(--alert-soft)"
          label={snapshot.national.populationShare != null
            ? t('intro.popLabel', { pct: formatPercent(snapshot.national.populationShare) })
            : undefined} />
      ),
    },
    {
      value: worstRate !== null ? formatPercent(worstRate) : '–',
      label: worst ? t('intro.step3Label', { county: worst.name }) : '',
      viz: shapes && worst && (
        <CountyShape shapes={shapes} name={worst.name} />
      ),
    },
    {
      value: longest ? formatDuration(monthsBetween(longest.vacantSince, snapshot.month)) : '–',
      label: longest && longestSite
        ? t('intro.step4Label', {
          settlement: longestSite.settlement,
          month: formatMonth(longest.vacantSince),
        })
        : '',
      viz: shapes && longest && longestSite
        && longestSite.lat !== undefined && longestSite.lon !== undefined && (
        <CountyShape shapes={shapes} name={longest.county}
          marker={[longestSite.lon, longestSite.lat]}
          markerLabel={longestSite.settlement} />
      ),
    },
  ][active];

  const steps = [1, 2, 3, 4].map((n) => tKind(`intro.text${n}`, kind));

  return (
    <section className="intro" aria-label={t('intro.aria')}>
      <div className="intro__stage" key={`${kind}-${active}`}>
        <div className="intro__value">{stage.value}</div>
        <div className="intro__label">{stage.label}</div>
        {stage.viz}
      </div>
      <div className="intro__steps">
        {steps.map((text, i) => (
          <div key={i} className={`intro__step ${i === active ? 'is-active' : ''}`}
            ref={(el) => { stepRefs.current[i] = el; }}>
            <p>{text}</p>
          </div>
        ))}
        <div className="intro__cta">
          <a href="#terkep">{t('intro.cta')}</a>
        </div>
      </div>
    </section>
  );
}
