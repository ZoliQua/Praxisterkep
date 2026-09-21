// Entry point of the EESZT page (eeszt.html). The section needs the monthly
// snapshot, so it waits for the store the same way the landing does.
import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { locale } from './lib/i18n';
import { useAppStore, useSnapshot } from './store/useAppStore';
import { EesztPage } from './components/EesztPage';

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
  return <EesztPage />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Page />
  </StrictMode>,
);
