// "Elemző" (elemzo.html): the analyses that go beyond the monthly picture —
// what may go vacant next, how long districts have survived so far, how much
// of the country is covered when the answer is read at settlement level
// instead of district seats, and the composite care-risk index that puts
// these together with distance and hospital access.
import { useState } from 'react';
import { t } from '../lib/i18n';
import { PageNav } from './PageNav';
import { RiskSection } from './RiskSection';
import type { PraxisKind } from '../types';

const LINKS = [
  ['eeszt.html', 'nav.eeszt'],
  ['szakellato.html', 'nav.specialist'],
] as const;

export function AnalysisPage() {
  const [kind, setKind] = useState<PraxisKind>('dental');

  return (
    <>
      <PageNav kind={kind} onKind={setKind} links={LINKS} />
      <header className="section container">
        <h1 className="section__heading">{t('analysis.heading')}</h1>
        <p className="section__lead">{t('analysis.lead')}</p>
      </header>
      <RiskSection kind={kind} />
    </>
  );
}
