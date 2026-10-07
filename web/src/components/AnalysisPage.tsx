// "Elemző" (elemzo.html): the analyses that go beyond the monthly picture —
// what may go vacant next, how long districts have survived so far, how much
// of the country is covered when the answer is read at settlement level
// instead of district seats, and the composite care-risk index that puts
// these together with distance and hospital access.
import { t } from '../lib/i18n';
import { useContextStore } from '../lib/context';
import { useHashScroll } from '../lib/useHashScroll';
import { PageNav } from './PageNav';
import { RiskSection } from './RiskSection';
import { SurvivalSection } from './SurvivalSection';
import { CoverageSection } from './CoverageSection';
import { CompositeSection } from './CompositeSection';
import { EmergencySection } from './EmergencySection';
import { WorkforceSection } from './WorkforceSection';
import { ClusterSection } from './ClusterSection';
import { TravelTimeSection } from './TravelTimeSection';
import { TransitSection } from './TransitSection';

const LINKS = [
  ['eeszt.html', 'nav.eeszt'],
  ['szakellato.html', 'nav.specialist'],
] as const;

export function AnalysisPage() {
  // the branch is site-wide context: whatever was chosen on the map holds here
  const kind = useContextStore((s) => s.kind);
  const setKind = useContextStore((s) => s.setKind);
  useHashScroll();

  return (
    <>
      <PageNav kind={kind} onKind={setKind} links={LINKS} />
      <header className="section container">
        <h1 className="section__heading">{t('analysis.heading')}</h1>
        <p className="section__lead">{t('analysis.lead')}</p>
      </header>
      <nav className="page-toc">
        {(['kockazat', 'tulel', 'orvosok', 'lefedettseg', 'ugyelet', 'menetido',
           'busz', 'index', 'hianyteruletek'] as const).map((id) => (
          <a key={id} href={`#${id}`}>{t(`analysis.toc.${id}`)}</a>
        ))}
      </nav>
      <RiskSection kind={kind} />
      <SurvivalSection kind={kind} />
      <WorkforceSection kind={kind} />
      <CoverageSection kind={kind} />
      <EmergencySection kind={kind} />
      <TravelTimeSection />
      <TransitSection />
      <CompositeSection />
      <ClusterSection />
    </>
  );
}
