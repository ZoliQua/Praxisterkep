// "Módszertan és adatok" (modszertan.html) — how the numbers are made and
// where to download them, off the landing page where they were the last two
// of eleven sections.
import { useHashScroll } from '../lib/useHashScroll';
import { PageNav } from './PageNav';
import { Methodology } from './Methodology';
import { DataSection } from './DataSection';
import { NextSteps } from './NextSteps';
import { Footer } from './Footer';

const NEXT = [
  { href: '/', titleKey: 'next.map.title', textKey: 'next.map.text' },
  { href: 'eeszt.html', titleKey: 'next.registry.title', textKey: 'next.registry.text' },
  { href: 'elemzo.html', titleKey: 'next.analysis.title', textKey: 'next.analysis.text' },
] as const;

export function MethodPage() {
  useHashScroll();
  return (
    <>
      <PageNav />
      <Methodology />
      <DataSection />
      <div className="section container"><NextSteps items={NEXT} /></div>
      <Footer />
    </>
  );
}
