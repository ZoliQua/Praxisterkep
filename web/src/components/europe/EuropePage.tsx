// "Európa" (europa.html): Hungary's primary care beside the EU and the UK.
//
// One page, two controls that hold for every chart on it: which countries
// are compared (the union, the region around Hungary with Germany and the UK
// as yardsticks, or the Visegrád four), and which country is in focus. The
// branch switch in the top bar picks the GP or the dental measures, the way
// it does everywhere else on the site.
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { t } from '../../lib/i18n';
import { useContextStore } from '../../lib/context';
import { useHashScroll } from '../../lib/useHashScroll';
import {
  byName, GROUP_KEYS, groupFromUrl, SECTION_IDS, useEurope, useEuropeGeo, type EuSection,
  type GroupKey,
} from '../../lib/europe';
import sections from '../../lib/pageSections.json';
import { PageNav } from '../PageNav';
import { Footer } from '../Footer';
import { PdfButton } from '../PdfButton';
import { NextSteps } from '../NextSteps';
import { SideNav, type SideGroup } from '../SideNav';
import { EuOverview } from './EuOverview';
import { IndicatorSection, type EuView } from './IndicatorSection';
import { EuTwoMeasures } from './EuTwoMeasures';
import { EuRegions } from './EuRegions';
import { EuMigration } from './EuMigration';

const GROUPS: SideGroup[] = (sections.europe as { key: string; items: string[] }[]).map((g) => ({
  titleKey: `europe.side.${g.key}`,
  items: g.items.map((id) => ({ id, labelKey: `europe.toc.${id}` })),
}));

const ORDER: EuSection[] = ['needs', 'workforce', 'access', 'outcomes', 'spending', 'pay'];

export function EuropePage() {
  const kind = useContextStore((s) => s.kind);
  const setKind = useContextStore((s) => s.setKind);
  const raw = useEurope();
  const geo = useEuropeGeo();
  const [group, setGroup] = useState<GroupKey>(() =>
    (typeof window === 'undefined' ? 'cee' : groupFromUrl(window.location.search)));
  const [focus, setFocus] = useState('HU');
  const [pick, setPick] = useState<Partial<Record<EuSection, string>>>({});
  useHashScroll();

  // the group lives in the address, so a shared link opens the same view
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('orszagok', group);
    window.history.replaceState(null, '', url);
  }, [group]);

  const nameOf = useCallback((g: string) => t(`europe.country.${g}`), []);
  const members = useMemo(() => (raw ? raw.groups[group] : []), [raw, group]);
  const frame = useMemo(() => new Set(members), [members]);
  // the focus follows the group: a country outside it would light nothing
  const live = members.includes(focus) ? focus : 'HU';

  if (!raw) {
    return (<><PageNav kind={kind} onKind={setKind} />
      <p className="section container">{t('europe.loading')}</p></>);
  }
  const view: EuView = { raw, geo, kind, members, frame, focus: live, onFocus: setFocus, nameOf };
  const open = (section: EuSection, indicator: string) => {
    setPick((p) => ({ ...p, [section]: indicator }));
    document.getElementById(SECTION_IDS[section])?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <>
      <PageNav kind={kind} onKind={setKind} />
      <header className="section container">
        <div className="heading-row">
          <h1 className="section__heading">{t('europe.heading')}</h1>
          <PdfButton level="europe" group={group} focus={live} />
        </div>
        <p className="section__lead">{t('europe.lead')}</p>
      </header>
      <div className="eu-toolbar">
        <div className="container eu-toolbar__inner">
          <span className="eu-toolbar__label">{t('europe.groupLabel')}</span>
          <div className="seg" role="group" aria-label={t('europe.groupLabel')}>
            {GROUP_KEYS.map((g) => (
              <button key={g} type="button" aria-pressed={group === g} onClick={() => setGroup(g)}
                title={t(`europe.groupHint.${g}`)}>
                {t(`europe.group.${g}`)}
              </button>
            ))}
          </div>
          <label className="eu-select eu-select--inline">
            <span>{t('europe.focusLabel')}</span>
            <select value={live} onChange={(e) => setFocus(e.target.value)}>
              {byName(members, nameOf).map((g) => <option key={g} value={g}>{nameOf(g)}</option>)}
            </select>
          </label>
          {live !== 'HU' && (
            <button type="button" className="data-btn" onClick={() => setFocus('HU')}>{t('europe.reset')}</button>
          )}
        </div>
      </div>
      <SideNav groups={GROUPS} labelKey="europe.sideNav" />

      <EuOverview view={view} onOpen={open} />
      {ORDER.map((s) => (
        <Fragment key={`${s}-${kind}`}>
          <IndicatorSection view={view} section={s} id={SECTION_IDS[s]}
            pick={pick[s]} onPick={(k) => setPick((p) => ({ ...p, [s]: k }))} />
          {/* the workforce in numbers, then the workforce on the move */}
          {s === 'workforce' && <EuMigration view={view} />}
        </Fragment>
      ))}
      <EuTwoMeasures key={kind} view={view} />
      <EuRegions view={view} />
      <div className="section container">
        <NextSteps items={[
          { href: '/elemzo.html', titleKey: 'next.analysis.title', textKey: 'next.analysis.text' },
          { href: '/modszertan.html#europa-modszer', titleKey: 'europe.next.method.title',
            textKey: 'europe.next.method.text' },
          { href: '/jaras.html#veszelyeztetett', titleKey: 'next.district.title', textKey: 'next.district.text' },
        ]} />
      </div>
      <Footer />
    </>
  );
}
