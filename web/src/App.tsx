import { useEffect } from 'react';
import { locale, t } from './lib/i18n';
import { useAppStore, useSnapshot } from './store/useAppStore';
import { Hero } from './components/Hero';
import { HeroShowcase } from './components/HeroShowcase';
import { PraxisBalance } from './components/PraxisBalance';
import { ScrollyIntro } from './components/ScrollyIntro';
import { ContextBar } from './components/ContextBar';
import { NextSteps } from './components/NextSteps';
import { SITE_NAV, withContext } from './lib/siteNav';
import { contextHref } from './lib/context';
import { useHashScroll } from './lib/useHashScroll';
import { MapSection } from './components/MapSection';
import { WhySection } from './components/WhySection';
import { SearchSection } from './components/SearchSection';
import { Footer } from './components/Footer';
import { LangToggle } from './components/LangToggle';
import { Highlights } from './components/Highlights';
import { NavMenu } from './components/NavMenu';
import { IconStethoscope, IconTooth } from './components/icons';
import type { PraxisKind } from './types';

/** Where the landing hands the reader on, now that it is only the question. */
const LANDING_NEXT = [
  { href: '/megye.html', titleKey: 'next.county.title', textKey: 'next.county.text' },
  { href: '/jaras.html', titleKey: 'next.myDistrict.title', textKey: 'next.myDistrict.text' },
  { href: '/elemzo.html', titleKey: 'next.analysis.title', textKey: 'next.analysis.text' },
  { href: '/#alapellatas', titleKey: 'next.why.title', textKey: 'next.why.text' },
] as const;

export default function App() {
  const snapshot = useSnapshot();
  const kind = useAppStore((s) => s.kind);
  const setKind = useAppStore((s) => s.setKind);
  const loadError = useAppStore((s) => s.loadError);
  const loadData = useAppStore((s) => s.loadData);
  // the sections arrive with the snapshot, so the browser's own jump to
  // #nalam happens before there is anything to jump to
  useHashScroll();

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    // drives the per-kind accent color (see index.css [data-kind='gp'])
    document.documentElement.dataset.kind = kind;
  }, [kind]);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, []);

  // sections that have moved to pages of their own: a link someone shared
  // before the split must still arrive where its content lives
  useEffect(() => {
    const moved: Record<string, string> = {
      modszertan: 'modszertan.html',
      adatok: 'modszertan.html#adatok', forrasok: 'modszertan.html',
      rangsor: 'megye.html#rangsor',
      statisztika: 'elemzo.html#statisztika',
      osszevetes: 'elemzo.html#osszevetes',
      tavolsag: 'elemzo.html#tavolsag',
    };
    const target = moved[decodeURIComponent(window.location.hash.slice(1))];
    if (target) window.location.replace(contextHref(target));
  }, []);

  if (loadError) return <div className="error">{loadError}</div>;
  if (!snapshot) return <div className="loading">…</div>;

  return (
    <>
      <nav className="topnav">
        <div className="topnav__inner">
          <span className="topnav__brand">{t('site.title')}</span>
          <div className="topnav__kind" role="group">
            <button aria-pressed={kind === 'dental'}
              title={t('kinds.dental.label')} aria-label={t('kinds.dental.label')}
              onClick={() => setKind('dental' as PraxisKind)}>
              <IconTooth />
            </button>
            <button aria-pressed={kind === 'gp'}
              title={t('kinds.gp.label')} aria-label={t('kinds.gp.label')}
              onClick={() => setKind('gp' as PraxisKind)}>
              <IconStethoscope />
            </button>
          </div>
          <LangToggle />
          <NavMenu entries={withContext(SITE_NAV)} />
        </div>
      </nav>
      <ContextBar />
      <Hero />
          <ScrollyIntro />
          <HeroShowcase />
          <PraxisBalance />
          <Highlights />
          <SearchSection />
          {/* the search narrows the map, so it comes after the question it
              answers rather than before it */}
      <MapSection />
      <WhySection />
      <div className="section container"><NextSteps items={LANDING_NEXT} /></div>
      <Footer />
    </>
  );
}
