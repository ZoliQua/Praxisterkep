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
import { NavMenu, type NavEntry } from './components/NavMenu';
import { IconStethoscope, IconTooth, IconVedono } from './components/icons';
import type { PraxisKind } from './types';

// Six entries instead of ten flat links; the sections that belong together
// travel in a submenu (see NavMenu).
const NAV: NavEntry[] = [
  {
    href: '#terkep',
    labelKey: 'nav.map',
    children: [['#alapellatas', 'nav.why'], ['#nalam', 'nav.mine']],
  },
  {
    href: '#statisztika',
    labelKey: 'nav.stats',
    children: [
      ['#rangsor', 'nav.ranking'],
      ['#osszevetes', 'nav.versus'],
      ['#tavolsag', 'nav.access'],
    ],
  },
  {
    href: '#modszertan',
    labelKey: 'nav.methodology',
    children: [['#adatok', 'nav.data']],
  },
  { href: 'elemzo.html', labelKey: 'nav.analysis' },
  { href: 'eeszt.html', labelKey: 'nav.eeszt' },
  { href: 'szakellato.html', labelKey: 'nav.specialist' },
];

const VEDONO_NAV: NavEntry[] = [
  { href: '#vedono', labelKey: 'nav.vedono' },
  {
    href: '#modszertan',
    labelKey: 'nav.methodology',
    children: [['#adatok', 'nav.data']],
  },
  { href: 'elemzo.html', labelKey: 'nav.analysis' },
  { href: 'eeszt.html', labelKey: 'nav.eeszt' },
  { href: 'szakellato.html', labelKey: 'nav.specialist' },
];

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
          <NavMenu entries={view === 'vedono' ? VEDONO_NAV : NAV} />
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
