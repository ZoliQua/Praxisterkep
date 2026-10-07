// Entry point of megye.html — the county level.
import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { locale } from './lib/i18n';
import { useAppStore, useSnapshot } from './store/useAppStore';
import { CountyPage } from './components/CountyPage';

function Page() {
  const loadData = useAppStore((s) => s.loadData);
  const snapshot = useSnapshot();
  const loadError = useAppStore((s) => s.loadError);
  const kind = useAppStore((s) => s.kind);
  useEffect(() => {
    document.documentElement.lang = locale;
    void loadData();
  }, [loadData]);
  useEffect(() => {
    document.documentElement.dataset.kind = kind;
  }, [kind]);
  if (loadError) return <div className="error">{loadError}</div>;
  if (!snapshot) return <div className="loading">…</div>;
  return <CountyPage />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Page />
  </StrictMode>,
);
