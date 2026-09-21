// The top bar of the standalone pages (analysis, EESZT, specialist care).
// The landing page has its own nav with the section anchors; here the brand
// leads home and the branch switch is local to the page, because these pages
// hold their own kind state rather than the landing's store.
import { t } from '../lib/i18n';
import { IconStethoscope, IconTooth } from './icons';
import type { PraxisKind } from '../types';

interface Props {
  /** null hides the branch switch (pages that are not per-branch) */
  kind?: PraxisKind | null;
  onKind?: (kind: PraxisKind) => void;
  /** other standalone pages worth reaching from here: [href, i18n key] */
  links?: readonly (readonly [string, string])[];
}

export function PageNav({ kind = null, onKind, links = [] }: Props) {
  const home = import.meta.env.BASE_URL;
  return (
    <nav className="topnav">
      <div className="topnav__inner">
        <a className="topnav__brand" href={home}>{t('site.title')}</a>
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
        <div className="topnav__links">
          <a href={home}>{t('nav.home')}</a>
          {links.map(([href, key]) => (
            <a key={href} href={`${home}${href}`}>{t(key)}</a>
          ))}
        </div>
      </div>
    </nav>
  );
}
