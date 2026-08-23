import { useEffect } from 'react';
import { t } from './lib/i18n';
import { useAppStore, useSnapshot } from './store/useAppStore';
import { Hero } from './components/Hero';
import { MapSection } from './components/MapSection';
import { SearchSection } from './components/SearchSection';
import { CountyRanking } from './components/CountyRanking';
import { StatsSection } from './components/StatsSection';
import { Methodology } from './components/Methodology';
import { Footer } from './components/Footer';

const NAV = [
  ['#terkep', 'nav.map'],
  ['#nalam', 'nav.mine'],
  ['#rangsor', 'nav.ranking'],
  ['#statisztika', 'nav.stats'],
  ['#modszertan', 'nav.methodology'],
  ['#forrasok', 'nav.sources'],
] as const;

export default function App() {
  const snapshot = useSnapshot();
  const kind = useAppStore((s) => s.kind);
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
          <span className="topnav__brand">
            {t('site.title')} <em>·</em> {t(`kinds.${kind}.question`)}
          </span>
          <div className="topnav__links">
            {NAV.map(([href, key]) => (
              <a key={href} href={href}>{t(key)}</a>
            ))}
          </div>
        </div>
      </nav>
      <Hero />
      <MapSection />
      {/* key remounts the search on kind toggle: its selection belongs to one snapshot */}
      <SearchSection key={kind} />
      <CountyRanking />
      <StatsSection />
      <Methodology />
      <Footer />
    </>
  );
}
