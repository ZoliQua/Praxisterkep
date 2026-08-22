import { useEffect } from 'react';
import { t } from './lib/i18n';
import { useAppStore } from './store/useAppStore';
import { Hero } from './components/Hero';
import { MapSection } from './components/MapSection';
import { SearchSection } from './components/SearchSection';
import { CountyRanking } from './components/CountyRanking';
import { Methodology } from './components/Methodology';
import { Footer } from './components/Footer';

const NAV = [
  ['#terkep', 'nav.map'],
  ['#nalam', 'nav.mine'],
  ['#rangsor', 'nav.ranking'],
  ['#modszertan', 'nav.methodology'],
  ['#forrasok', 'nav.sources'],
] as const;

export default function App() {
  const snapshot = useAppStore((s) => s.snapshot);
  const loadError = useAppStore((s) => s.loadError);
  const loadData = useAppStore((s) => s.loadData);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  if (loadError) return <div className="error">{loadError}</div>;
  if (!snapshot) return <div className="loading">…</div>;

  return (
    <>
      <nav className="topnav">
        <div className="topnav__inner">
          <span className="topnav__brand">
            {t('site.title')} <em>·</em> {t('site.subtitle')}
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
      <SearchSection />
      <CountyRanking />
      <Methodology />
      <Footer />
    </>
  );
}
