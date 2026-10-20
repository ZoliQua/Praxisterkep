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
import { Footer } from './Footer';
import { PdfButton } from './PdfButton';
import { StatsSection } from './StatsSection';
import { VersusSection } from './VersusSection';
import { AccessSection } from './AccessSection';
import { RiskSection } from './RiskSection';
import { DistrictAnalysis } from './DistrictAnalysis';
import { SurvivalSection } from './SurvivalSection';
import { CoverageSection } from './CoverageSection';
import { CompositeSection } from './CompositeSection';
import { EmergencySection } from './EmergencySection';
import { ClusterSection } from './ClusterSection';
import { TravelTimeSection } from './TravelTimeSection';
import { TransitSection } from './TransitSection';
import { MortalitySection } from './MortalitySection';
import { LivingSection } from './LivingSection';
import { LinksSection } from './LinksSection';
import { CrossSection } from './CrossSection';
import { CensusSection } from './CensusSection';
import { SboSection } from './SboSection';
import { GrantsSection } from './GrantsSection';
import { ForecastSection } from './ForecastSection';
import { SideNav, type SideGroup } from './SideNav';
import sections from '../lib/pageSections.json';

// the page's groups, in order: the same list builds the top table of
// contents, the side menu and the dropdown in the top bar
const GROUPS: SideGroup[] = (sections.analysis as { key: string; items: string[] }[]).map((g) => ({
  titleKey: `analysis.group.${g.key}`,
  items: g.items.map((id) => ({ id, labelKey: `analysis.toc.${id}` })),
}));

/** A group's heading between its sections. */
function GroupHead({ id }: { id: string }) {
  return (
    <div className="section container analysis-group" id={`csoport-${id}`}>
      <p className="analysis-group__kicker">{t('analysis.groupKicker')}</p>
      <h2 className="analysis-group__title">{t(`analysis.group.${id}`)}</h2>
      <p className="analysis-group__lead">{t(`analysis.groupLead.${id}`)}</p>
    </div>
  );
}

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
        <div className="heading-row">
          <h1 className="section__heading">{t('analysis.heading')}</h1>
          <PdfButton level="analysis" />
        </div>
        <p className="section__lead">{t('analysis.lead')}</p>
      </header>
      <nav className="page-toc page-toc--grouped">
        {GROUPS.map((g) => (
          <div key={g.titleKey} className="page-toc__group">
            <span className="page-toc__title">{t(g.titleKey)}</span>
            {g.items.map((i) => <a key={i.id} href={`#${i.id}`}>{t(i.labelKey)}</a>)}
          </div>
        ))}
      </nav>
      <SideNav groups={GROUPS} labelKey="analysis.sideNav" />

      <GroupHead id="national" />
      <StatsSection />
      <VersusSection />
      <CoverageSection kind={kind} />

      <GroupHead id="future" />
      <RiskSection kind={kind} />
      <SurvivalSection kind={kind} />
      {/* the two above, put together: how many will be vacant in a year —
          and whether paying a doctor to settle has filled districts so far */}
      <ForecastSection key={kind} kind={kind} />
      <GrantsSection />

      <GroupHead id="districts" />
      <DistrictAnalysis />
      {/* what a vacancy goes with: the deaths it may cost, and the
          circumstances that make a district hard to fill */}
      <MortalitySection />
      <LivingSection />
      <CensusSection />
      <LinksSection />

      <GroupHead id="access" />
      <EmergencySection kind={kind} />
      <AccessSection />
      <TravelTimeSection />
      <SboSection />
      <TransitSection />

      <GroupHead id="settlements" />
      <CompositeSection />
      <CrossSection />
      <ClusterSection />
      <Next items={[
        { href: '/megye.html', titleKey: 'next.county.title', textKey: 'next.county.text' },
        { href: '/jaras.html#veszelyeztetett', titleKey: 'next.district.title',
          textKey: 'next.district.text' },
        { href: '/szakellato.html', titleKey: 'next.specialist.title',
          textKey: 'next.specialist.text' },
      ]} />
      <Footer />
    </>
  );
}
