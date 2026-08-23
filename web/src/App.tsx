import { useEffect } from 'react';
import { t } from './lib/i18n';
import { useAppStore, useSnapshot } from './store/useAppStore';
import { Hero } from './components/Hero';
import { MapSection } from './components/MapSection';
import { SearchSection } from './components/SearchSection';
import { CountyRanking } from './components/CountyRanking';
import { StatsSection } from './components/StatsSection';
import { WhySection } from './components/WhySection';
import { Methodology } from './components/Methodology';
import { Footer } from './components/Footer';
import { IconStethoscope, IconTooth } from './components/icons';
import type { PraxisKind } from './types';

const NAV = [
  ['#terkep', 'nav.map'],
  ['#alapellatas', 'nav.why'],
  ['#nalam', 'nav.mine'],
  ['#rangsor', 'nav.ranking'],
  ['#statisztika', 'nav.stats'],
  ['#modszertan', 'nav.methodology'],
] as const;

export default function App() {
  const snapshot = useSnapshot();
  const kind = useAppStore((s) => s.kind);
  const setKind = useAppStore((s) => s.setKind);
  const loadError = useAppStore((s) => s.loadError);
  const loadData = useAppStore((s) => s.loadData);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    // drives the per-kind accent color (see index.css [data-kind='gp'])
    document.documentElement.dataset.kind = kind;
  }, [kind]);

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
          <div className="topnav__links">
            {NAV.map(([href, key]) => (
              <a key={href} href={href}>{t(key)}</a>
            ))}
          </div>
        </div>
      </nav>
      <Hero />
      <MapSection />
      <WhySection />
      <SearchSection />
      <CountyRanking />
      <StatsSection />
      <Methodology />
      <Footer />
    </>
  );
}
