import { useEffect } from 'react';
import { locale, t } from './lib/i18n';
import { useAppStore, useSnapshot } from './store/useAppStore';
import { Hero } from './components/Hero';
import { ScrollyIntro } from './components/ScrollyIntro';
import { ContextBar } from './components/ContextBar';
import { NextSteps } from './components/NextSteps';
import { SITE_NAV, VEDONO_NAV, withContext } from './lib/siteNav';
import { contextHref } from './lib/context';
import { useHashScroll } from './lib/useHashScroll';
import { MapSection } from './components/MapSection';
import { SearchSection } from './components/SearchSection';
import { Footer } from './components/Footer';
import { VedonoSection } from './components/VedonoSection';
import { NavMenu } from './components/NavMenu';
import { IconStethoscope, IconTooth, IconVedono } from './components/icons';
import type { PraxisKind } from './types';

/** Where the landing hands the reader on, now that it is only the question. */
const LANDING_NEXT = [
  { href: '/megye.html', titleKey: 'next.county.title', textKey: 'next.county.text' },
  { href: '/elemzo.html', titleKey: 'next.analysis.title', textKey: 'next.analysis.text' },
  { href: '/miert.html', titleKey: 'next.why.title', textKey: 'next.why.text' },
  { href: '/modszertan.html', titleKey: 'next.method.title', textKey: 'next.method.text' },
] as const;

export default function App() {
  const snapshot = useSnapshot();
  const kind = useAppStore((s) => s.kind);
  const setKind = useAppStore((s) => s.setKind);
  const view = useAppStore((s) => s.view);
  const setView = useAppStore((s) => s.setView);
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
      alapellatas: 'miert.html', modszertan: 'modszertan.html',
      adatok: 'modszertan.html#adatok', forrasok: 'modszertan.html',
      rangsor: 'megye.html#rangsor',
      statisztika: 'elemzo.html#statisztika',
      osszevetes: 'elemzo.html#osszevetes',
      tavolsag: 'elemzo.html#tavolsag',
    };
    const target = moved[decodeURIComponent(window.location.hash.slice(1))];
    if (target) window.location.replace(contextHref(target));
  }, []);

  function switchLocale() {
    const url = new URL(window.location.href);
    url.searchParams.set('lang', locale === 'hu' ? 'en' : 'hu');
    window.location.href = url.toString();
  }

  if (loadError) return <div className="error">{loadError}</div>;
  if (!snapshot) return <div className="loading">…</div>;

  return (
    <>
      <nav className="topnav">
        <div className="topnav__inner">
          <span className="topnav__brand">{t('site.title')}</span>
          <div className="topnav__kind" role="group">
            <button aria-pressed={view === 'praxis' && kind === 'dental'}
              title={t('kinds.dental.label')} aria-label={t('kinds.dental.label')}
              onClick={() => setKind('dental' as PraxisKind)}>
              <IconTooth />
            </button>
            <button aria-pressed={view === 'praxis' && kind === 'gp'}
              title={t('kinds.gp.label')} aria-label={t('kinds.gp.label')}
              onClick={() => setKind('gp' as PraxisKind)}>
              <IconStethoscope />
            </button>
            <button aria-pressed={view === 'vedono'}
              title={t('vedono.label')} aria-label={t('vedono.label')}
              onClick={() => setView('vedono')}>
              <IconVedono />
            </button>
          </div>
          <button className="topnav__lang" onClick={switchLocale}
            aria-label={locale === 'hu' ? 'Switch to English' : 'Váltás magyarra'}>
            {locale === 'hu' ? 'EN' : 'HU'}
          </button>
          <NavMenu entries={withContext(view === 'vedono' ? VEDONO_NAV : SITE_NAV)} />
        </div>
      </nav>
      <ContextBar />
      {view === 'vedono' ? <VedonoSection /> : (
        <>
          <Hero />
          <ScrollyIntro />
          <MapSection />
          <SearchSection />
        </>
      )}
      <div className="section container"><NextSteps items={LANDING_NEXT} /></div>
      <Footer />
    </>
  );
}
