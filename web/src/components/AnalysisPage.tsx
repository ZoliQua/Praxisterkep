// "Elemző" (elemzo.html): the analyses that go beyond the monthly picture —
// what may go vacant next, how long districts have survived so far, how much
// of the country is covered when the answer is read at settlement level
// instead of district seats, and the composite care-risk index that puts
// these together with distance and hospital access.
import { t } from '../lib/i18n';
import { useContextStore } from '../lib/context';
import { useHashScroll } from '../lib/useHashScroll';
import { NextSteps } from './NextSteps';
import { PageNav } from './PageNav';
import { StatsSection } from './StatsSection';
import { VersusSection } from './VersusSection';
import { AccessSection } from './AccessSection';
import { RiskSection } from './RiskSection';
import { SurvivalSection } from './SurvivalSection';
import { CoverageSection } from './CoverageSection';
import { CompositeSection } from './CompositeSection';
import { EmergencySection } from './EmergencySection';
import { WorkforceSection } from './WorkforceSection';
import { ClusterSection } from './ClusterSection';
import { TravelTimeSection } from './TravelTimeSection';
import { TransitSection } from './TransitSection';

/** One hand-off between two analyses, in the page's own rhythm. */
function Next({ items }: { items: Parameters<typeof NextSteps>[0]['items'] }) {
  return <div className="section container"><NextSteps items={items} /></div>;
}

export function AnalysisPage() {
  // the branch is site-wide context: whatever was chosen on the map holds here
  const kind = useContextStore((s) => s.kind);
  const setKind = useContextStore((s) => s.setKind);
  useHashScroll();

  return (
    <>
      <PageNav kind={kind} onKind={setKind} />
      <header className="section container">
        <h1 className="section__heading">{t('analysis.heading')}</h1>
        <p className="section__lead">{t('analysis.lead')}</p>
      </header>
      <nav className="page-toc">
        {(['statisztika', 'osszevetes', 'kockazat', 'tulel', 'orvosok',
           'lefedettseg', 'ugyelet', 'tavolsag', 'menetido', 'busz', 'index',
           'hianyteruletek'] as const).map((id) => (
          <a key={id} href={`#${id}`}>{t(`analysis.toc.${id}`)}</a>
        ))}
      </nav>
      <StatsSection />
      <VersusSection />
      <RiskSection kind={kind} />
      <SurvivalSection kind={kind} />
      <WorkforceSection kind={kind} />
      <CoverageSection kind={kind} />
      <EmergencySection kind={kind} />
      <AccessSection />
      <TravelTimeSection />
      <Next items={[
        { href: '/elemzo.html#busz', titleKey: 'next.bus.title', textKey: 'next.bus.text' },
        { href: '/megye.html', titleKey: 'next.county.title', textKey: 'next.county.text' },
      ]} />
      <TransitSection />
      <CompositeSection />
      <Next items={[
        { href: '/elemzo.html#hianyteruletek', titleKey: 'next.deserts.title',
          textKey: 'next.deserts.text' },
        { href: '/megye.html#telepulesek', titleKey: 'next.settlement.title',
          textKey: 'next.settlement.text' },
        { href: '/modszertan.html', titleKey: 'next.method.title',
          textKey: 'next.method.text' },
      ]} />
      <ClusterSection />
      <Next items={[
        { href: '/megye.html', titleKey: 'next.county.title', textKey: 'next.county.text' },
        { href: '/eeszt.html', titleKey: 'next.registry.title',
          textKey: 'next.registry.text' },
        { href: '/szakellato.html', titleKey: 'next.specialist.title',
          textKey: 'next.specialist.text' },
      ]} />
    </>
  );
}
