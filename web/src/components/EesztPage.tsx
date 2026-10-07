// "EESZT-kiegészítés" (eeszt.html): the whole EESZT complex on its own page —
// how the public master data was joined to the NEAK districts, the services
// that are not districts, the cross-check and the unified NEAK list. It used
// to sit at the bottom of the landing page, where its size buried everything
// that came after it.
import { useAppStore } from '../store/useAppStore';
import { PageNav } from './PageNav';
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
      <EesztSection />
    </>
  );
}
