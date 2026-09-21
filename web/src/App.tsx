import { useEffect } from 'react';
import { locale, t } from './lib/i18n';
import { useAppStore, useSnapshot } from './store/useAppStore';
import { Hero } from './components/Hero';
import { ScrollyIntro } from './components/ScrollyIntro';
import { MapSection } from './components/MapSection';
import { SearchSection } from './components/SearchSection';
import { CountyRanking } from './components/CountyRanking';
import { StatsSection } from './components/StatsSection';
import { VersusSection } from './components/VersusSection';
import { AccessSection } from './components/AccessSection';
import { WhySection } from './components/WhySection';
import { DataSection } from './components/DataSection';
import { Methodology } from './components/Methodology';
import { Footer } from './components/Footer';
import { VedonoSection } from './components/VedonoSection';
import { IconStethoscope, IconTooth, IconVedono } from './components/icons';
import type { PraxisKind } from './types';

const VEDONO_NAV = [
  ['#vedono', 'nav.vedono'],
  ['#adatok', 'nav.data'],
  ['elemzo.html', 'nav.analysis'],
  ['eeszt.html', 'nav.eeszt'],
  ['#modszertan', 'nav.methodology'],
] as const;

const NAV = [
  ['#terkep', 'nav.map'],
  ['#alapellatas', 'nav.why'],
  ['#nalam', 'nav.mine'],
  ['#rangsor', 'nav.ranking'],
  ['#statisztika', 'nav.stats'],
  ['#osszevetes', 'nav.versus'],
  ['#tavolsag', 'nav.access'],
  ['#adatok', 'nav.data'],
  ['elemzo.html', 'nav.analysis'],
  ['eeszt.html', 'nav.eeszt'],
  ['#modszertan', 'nav.methodology'],
] as const;

export default function App() {
  const snapshot = useSnapshot();
  const kind = useAppStore((s) => s.kind);
  const setKind = useAppStore((s) => s.setKind);
  const view = useAppStore((s) => s.view);
  const setView = useAppStore((s) => s.setView);
  const loadError = useAppStore((s) => s.loadError);
  const loadData = useAppStore((s) => s.loadData);

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
          <div className="topnav__links">
            {(view === 'vedono' ? VEDONO_NAV : NAV).map(([href, key]) => (
              <a key={href} href={href}>{t(key)}</a>
            ))}
          </div>
        </div>
      </nav>
      {view === 'vedono' ? <VedonoSection /> : (
        <>
          <Hero />
          <ScrollyIntro />
          <MapSection />
          <WhySection />
          <SearchSection />
          <CountyRanking />
          <StatsSection />
          <VersusSection />
          <AccessSection />
        </>
      )}
      <DataSection />
      <Methodology />
      <Footer />
    </>
  );
}
