// "Módszertan és adatok" (modszertan.html) — how the numbers are made and
// where to download them, off the landing page where they were the last two
// of eleven sections.
import { useHashScroll } from '../lib/useHashScroll';
import { PageNav } from './PageNav';
import { Methodology } from './Methodology';
import { OutcomeMethod } from './OutcomeMethod';
import { METHOD_PARAGRAPHS, OUTCOME_ITEMS } from '../lib/methodSections';
import { SideNav, type SideGroup } from './SideNav';
import { DataSection } from './DataSection';
import { NextSteps } from './NextSteps';
import { Footer } from './Footer';

const NEXT = [
  { href: '/', titleKey: 'next.map.title', textKey: 'next.map.text' },
  { href: 'eeszt.html', titleKey: 'next.registry.title', textKey: 'next.registry.text' },
  { href: 'elemzo.html', titleKey: 'next.analysis.title', textKey: 'next.analysis.text' },
] as const;

// the method page in the order it reads: what every number rests on, how the
// outcome analyses are made, and the files themselves
const GROUPS: SideGroup[] = [
  { titleKey: 'method.group.base', items: [
    ...METHOD_PARAGRAPHS.map((k) => ({ id: `m-${k}`, labelKey: `methodology.titles.${k}` })),
    { id: 'm-referral', labelKey: 'method.referral' },
  ] },
  { titleKey: 'method.group.outcomes', items:
    OUTCOME_ITEMS.map((k) => ({ id: `k-${k}`, labelKey: `outcomeMethod.${k}.title` })) },
  { titleKey: 'method.group.data', items: [
    { id: 'adatok', labelKey: 'method.data' },
    { id: 'm-embed', labelKey: 'method.embed' },
  ] },
];

export function MethodPage() {
  useHashScroll();
  return (
    <>
      <PageNav />
      <SideNav groups={GROUPS} labelKey="method.sideNav" />
      <Methodology />
      <OutcomeMethod />
      <DataSection />
      <div className="section container"><NextSteps items={NEXT} /></div>
      <Footer />
    </>
  );
}
