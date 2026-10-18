// "EESZT-kiegészítés" (eeszt.html): the whole EESZT complex on its own page —
// how the public master data was joined to the NEAK districts, the services
// that are not districts, the cross-check and the unified NEAK list. It used
// to sit at the bottom of the landing page, where its size buried everything
// that came after it.
import { t } from '../lib/i18n';
import { useAppStore } from '../store/useAppStore';
import { PageNav } from './PageNav';
import { Footer } from './Footer';
import { useHashScroll } from '../lib/useHashScroll';
import { EesztSection } from './EesztSection';
import type { PraxisKind } from '../types';

export function EesztPage() {
  const kind = useAppStore((s) => s.kind);
  const setKind = useAppStore((s) => s.setKind);
  useHashScroll();
  return (
    <>
      <PageNav kind={kind} onKind={(k: PraxisKind) => setKind(k)} />
      {/* This page is reachable only from the sources list in the footer, and
          that is deliberate. It is a working note: it holds two public
          registers against each other and shows where they disagree. Those
          disagreements are the state's own, not findings about any physician
          or provider, and the page has to say so before it says anything
          else. */}
      <section className="section container">
        <p className="notice notice--strong">{t('eeszt.internalNote')}</p>
      </section>
      <EesztSection />
      <Footer />
    </>
  );
}
