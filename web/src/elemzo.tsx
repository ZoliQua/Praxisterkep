// Entry point of the analysis page (elemzo.html).
import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { locale } from './lib/i18n';
import { useAppStore } from './store/useAppStore';
import { AnalysisPage } from './components/AnalysisPage';

function Page() {
  const loadData = useAppStore((s) => s.loadData);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dataset.kind = 'dental';
    void loadData(); // the county bounds and labels come from the snapshot store
  }, [loadData]);
  return <AnalysisPage />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Page />
  </StrictMode>,
);
