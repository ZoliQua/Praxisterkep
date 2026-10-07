// "Miért fontos az alapellátás?" (miert.html) — the argument, on its own page.
//
// It used to sit in the middle of the landing page, between the map and the
// search box: nine hundred lines of explainer that a reader looking for their
// own settlement had to scroll past, and that a reader who came for the
// argument could not link to. Separating them lets each do its job.
import { useHashScroll } from '../lib/useHashScroll';
import { PageNav } from './PageNav';
import { WhySection } from './WhySection';
import { NextSteps } from './NextSteps';
import { Footer } from './Footer';

const NEXT = [
  { href: '/', titleKey: 'next.map.title', textKey: 'next.map.text' },
  { href: 'elemzo.html', titleKey: 'next.analysis.title', textKey: 'next.analysis.text' },
  { href: 'modszertan.html', titleKey: 'next.method.title', textKey: 'next.method.text' },
] as const;

export function WhyPage() {
  useHashScroll();
  return (
    <>
      <PageNav />
      <WhySection />
      <div className="section container"><NextSteps items={NEXT} /></div>
      <Footer />
    </>
  );
}
