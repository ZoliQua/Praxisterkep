// "EESZT-kiegészítés" (eeszt.html): the whole EESZT complex on its own page —
// how the public master data was joined to the NEAK districts, the services
// that are not districts, the cross-check and the unified NEAK list. It used
// to sit at the bottom of the landing page, where its size buried everything
// that came after it.
import { useAppStore } from '../store/useAppStore';
import { PageNav } from './PageNav';
import { EesztSection } from './EesztSection';
import type { PraxisKind } from '../types';

const LINKS = [
  ['elemzo.html', 'nav.analysis'],
  ['szakellato.html', 'nav.specialist'],
] as const;

export function EesztPage() {
  const kind = useAppStore((s) => s.kind);
  const setKind = useAppStore((s) => s.setKind);
  return (
    <>
      <PageNav kind={kind} onKind={(k: PraxisKind) => setKind(k)} links={LINKS} />
      <EesztSection />
    </>
  );
}
