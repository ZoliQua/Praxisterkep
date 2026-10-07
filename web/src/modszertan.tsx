// Entry point of modszertan.html. The sections read the monthly snapshot, so the
// page waits for the store exactly as the landing does.
import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { locale } from './lib/i18n';
import { useAppStore, useSnapshot } from './store/useAppStore';
import { MethodPage } from './components/MethodPage';

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
  return <MethodPage />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Page />
  </StrictMode>,
);
