// The top bar of every standalone page. It shows the same six-plus-one
// entries as the landing (lib/siteNav.ts) in the order of the zooms they
// offer, and every link carries the branch and the area on.
import { t } from '../lib/i18n';
import { contextHref } from '../lib/context';
import { ContextBar } from './ContextBar';
import { NavMenu } from './NavMenu';
import { SITE_NAV, withContext } from '../lib/siteNav';
import { IconStethoscope, IconTooth } from './icons';
import type { PraxisKind } from '../types';

interface Props {
  /** null hides the branch switch (pages that are not per-branch) */
  kind?: PraxisKind | null;
  onKind?: (kind: PraxisKind) => void;
}

export function PageNav({ kind = null, onKind }: Props) {
  const home = import.meta.env.BASE_URL;
  return (
    <>
    <nav className="topnav">
      <div className="topnav__inner">
        <a className="topnav__brand" href={contextHref(home)}>{t('site.title')}</a>
        {kind && onKind && (
          <div className="topnav__kind" role="group">
            <button aria-pressed={kind === 'dental'}
              title={t('kinds.dental.label')} aria-label={t('kinds.dental.label')}
              onClick={() => onKind('dental')}>
              <IconTooth />
            </button>
            <button aria-pressed={kind === 'gp'}
              title={t('kinds.gp.label')} aria-label={t('kinds.gp.label')}
              onClick={() => onKind('gp')}>
              <IconStethoscope />
            </button>
          </div>
        )}
        <NavMenu entries={withContext(SITE_NAV)} />
      </div>
    </nav>
    <ContextBar />
    </>
  );
}
