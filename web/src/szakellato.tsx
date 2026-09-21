// Entry point of the specialist-care page (szakellato.html).
import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { locale } from './lib/i18n';
import { SpecialistPage } from './components/SpecialistPage';

function Page() {
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dataset.kind = 'dental';
  }, []);
  return <SpecialistPage />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Page />
  </StrictMode>,
);
