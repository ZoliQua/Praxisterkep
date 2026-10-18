// Entry point of adatkezeles.html — the privacy notice.
import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { locale } from './lib/i18n';
import { PrivacyPage } from './components/PrivacyPage';

function Page() {
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dataset.kind = 'dental';
  }, []);
  return <PrivacyPage />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Page />
  </StrictMode>,
);
