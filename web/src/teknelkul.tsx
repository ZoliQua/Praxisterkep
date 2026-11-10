// Entry point of tek-nelkul.html — GP practices without a district obligation.
import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './lib/measure';
import { locale } from './lib/i18n';
import { NonTerritorialPage } from './components/NonTerritorialPage';

function Page() {
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dataset.kind = 'gp';
  }, []);
  return <NonTerritorialPage />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Page />
  </StrictMode>,
);
