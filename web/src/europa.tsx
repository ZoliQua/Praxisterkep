// Entry point of the European comparison (europa.html).
import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { locale } from './lib/i18n';
import { useContextStore } from './lib/context';
import { EuropePage } from './components/europe/EuropePage';

function Page() {
  const kind = useContextStore((s) => s.kind);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, []);
  // the branch colours the page, as it does everywhere else
  useEffect(() => {
    document.documentElement.dataset.kind = kind;
  }, [kind]);
  return <EuropePage />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Page />
  </StrictMode>,
);
