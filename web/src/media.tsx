// Entry point of media.html — articles about the site.
import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './lib/measure';
import { locale } from './lib/i18n';
import { MediaPage } from './components/MediaPage';

function Page() {
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dataset.kind = 'gp';
  }, []);
  return <MediaPage />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Page />
  </StrictMode>,
);
