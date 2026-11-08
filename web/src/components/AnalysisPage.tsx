// "Elemző" (elemzo.html): the analyses that go beyond the monthly picture —
// what changed, what may go vacant next, how the districts' circumstances go
// with their vacancies, how far care is, and the settlements read on several
// counts at once.
//
// It is an overview and six parts (lib/analysisParts.ts). Each part is a
// chunk of its own, loaded when it is opened, so a reader who wants the
// travel times no longer downloads the code of twenty other sections.
import { Suspense, lazy, useEffect, useState, type ComponentType } from 'react';
import { t } from '../lib/i18n';
import { useContextStore } from '../lib/context';
import { useHashScroll } from '../lib/useHashScroll';
import {
  PARTS, partAnchor, resolvePart, withPart, type AnalysisPart,
} from '../lib/analysisParts';
import { NextSteps, type NextStep } from './NextSteps';
import { PageNav } from './PageNav';
import { Footer } from './Footer';
import { PdfButton } from './PdfButton';
import { AnalysisStory } from './story/PageStories';
import { SideNav, type SideGroup } from './SideNav';
import type { PartProps } from './analysisParts/types';

const VIEWS: Record<string, ComponentType<PartProps>> = {
  national: lazy(() => import('./analysisParts/National')),
  changes: lazy(() => import('./analysisParts/Changes')),
  future: lazy(() => import('./analysisParts/Future')),
  districts: lazy(() => import('./analysisParts/Districts')),
  access: lazy(() => import('./analysisParts/Access')),
  settlements: lazy(() => import('./analysisParts/Settlements')),
};

const sideGroup = (p: AnalysisPart): SideGroup => ({
  titleKey: `analysis.group.${p.key}`,
  items: p.items.map((id) => ({ id, labelKey: `analysis.toc.${id}` })),
});

const LAST_STEPS: NextStep[] = [
  { href: '/megye.html', titleKey: 'next.county.title', textKey: 'next.county.text' },
  { href: '/jaras.html#veszelyeztetett', titleKey: 'next.district.title', textKey: 'next.district.text' },
  { href: '/szakellato.html', titleKey: 'next.specialist.title', textKey: 'next.specialist.text' },
];

/**
 * The part the address names, followed as it changes: a link to an anchor of
 * another part (the menu, a hand-off card) only changes the hash, and the
 * page answers by opening that part. The address bar then keeps ?resz=.
 */
function useAnalysisPart(): AnalysisPart | null {
  const read = () => resolvePart(window.location.search, window.location.hash);
  const [part, setPart] = useState<AnalysisPart | null>(read);
  useEffect(() => {
    const sync = () => {
      const next = read();
      setPart(next);
      if (next) {
        const { pathname, search, hash } = window.location;
        const q = withPart(search, next);
        if (q !== search) window.history.replaceState(window.history.state, '', `${pathname}${q}${hash}`);
      }
    };
    sync();
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
    return () => {
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('popstate', sync);
    };
  }, []);
  useEffect(() => {
    document.title = part
      ? t('analysis.partTitle', { part: t(`analysis.group.${part.key}`) })
      : t('analysis.pageTitle');
  }, [part]);
  return part;
}

/** The six parts as tabs, the open one lit. */
function PartTabs({ current }: { current: AnalysisPart }) {
  return (
    <nav className="analysis-tabs" aria-label={t('analysis.partsLabel')}>
      {PARTS.map((p) => (
        <a key={p.key} href={partAnchor(p)} aria-current={p === current ? 'page' : undefined}>
          {t(`analysis.group.${p.key}`)}
        </a>
      ))}
    </nav>
  );
}

function Overview() {
  return (
    <>
      <nav className="section container analysis-parts" aria-label={t('analysis.partsLabel')}>
        {PARTS.map((p) => (
          <div key={p.key} className="analysis-part">
            <a className="analysis-part__title" href={partAnchor(p)}>{t(`analysis.group.${p.key}`)}</a>
            <p className="analysis-part__lead">{t(`analysis.groupLead.${p.key}`)}</p>
            <ul className="analysis-part__items">
              {p.items.map((id) => <li key={id}><a href={`#${id}`}>{t(`analysis.toc.${id}`)}</a></li>)}
            </ul>
          </div>
        ))}
      </nav>
      <div className="section container"><NextSteps items={LAST_STEPS} /></div>
    </>
  );
}

function Part({ part, kind }: { part: AnalysisPart; kind: PartProps['kind'] }) {
  const View = VIEWS[part.key];
  const i = PARTS.indexOf(part);
  const next = PARTS[i + 1];
  // a new part starts at its top, unless the address names a section in it
  useEffect(() => {
    if (!window.location.hash || window.location.hash === partAnchor(part)) window.scrollTo(0, 0);
  }, [part]);
  return (
    <>
      <header className="section container analysis-head" id={`csoport-${part.key}`}>
        {/* the overview is this page without the part: the rest of the query stays */}
        <a className="analysis-group__kicker" href={`${window.location.pathname}${withPart(window.location.search, null)}`}
          onClick={(e) => {
            e.preventDefault();
            window.location.assign(`${window.location.pathname}${withPart(window.location.search, null)}`);
          }}>
          {t('analysis.groupKicker')}
        </a>
        <div className="heading-row">
          <h1 className="analysis-group__title">{t(`analysis.group.${part.key}`)}</h1>
          <PdfButton level="analysis" />
        </div>
        <p className="analysis-group__lead">{t(`analysis.groupLead.${part.key}`)}</p>
        <PartTabs current={part} />
        {part.items.length > 1 && (
          <nav className="page-toc">
            {part.items.map((id) => <a key={id} href={`#${id}`}>{t(`analysis.toc.${id}`)}</a>)}
          </nav>
        )}
      </header>
      <SideNav key={part.key} groups={[sideGroup(part)]} labelKey="analysis.sideNav" />
      <Suspense fallback={<div className="deferred" style={{ minHeight: 600 }} aria-hidden="true" />}>
        <View kind={kind} />
      </Suspense>
      <div className="section container">
        <NextSteps items={next
          ? [{ href: partAnchor(next), titleKey: `analysis.group.${next.key}`, textKey: `analysis.groupLead.${next.key}` }]
          : LAST_STEPS} />
      </div>
    </>
  );
}

export function AnalysisPage() {
  // the branch is site-wide context: whatever was chosen on the map holds here
  const kind = useContextStore((s) => s.kind);
  const setKind = useContextStore((s) => s.setKind);
  const part = useAnalysisPart();
  useHashScroll();

  return (
    <>
      <PageNav kind={kind} onKind={setKind} />
      {part ? <Part key={part.key} part={part} kind={kind} /> : (
        <>
          <header className="section container">
            <div className="heading-row">
              <h1 className="section__heading">{t('analysis.heading')}</h1>
              <PdfButton level="analysis" />
            </div>
            <p className="section__lead">{t('analysis.lead')}</p>
            <AnalysisStory kind={kind} />
          </header>
          <Overview />
        </>
      )}
      <Footer />
    </>
  );
}
