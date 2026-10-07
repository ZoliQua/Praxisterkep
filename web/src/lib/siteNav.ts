// The one menu, in the order of the zooms it offers: country, county,
// settlement, then what follows from them and what they are built on.
//
// There used to be four different menus for the same site — the landing's,
// the standalone pages', and the one baked into the 3177 generated settlement
// pages, each with a different idea of which pages exist. This module is the
// single definition; the static generator reads the same labels out of the
// Hungarian locale file, so the two cannot drift apart again.
import type { NavEntry } from '../components/NavMenu';
import { contextHref } from './context';
import { entries } from './siteNav.json';

/**
 * The entries live in siteNav.json, not here: scripts/settlement-pages.mjs
 * builds the same bar for the 3177 static pages and reads that file, so the
 * app and the generated pages cannot drift apart. Hrefs are site-absolute,
 * because the same entry has to work from the landing, from a standalone
 * page and from /telepules/<slug>/.
 */
export const SITE_NAV = (entries as NavEntry[]);

/** The landing when the health-visitor view is on: its sections are different. */
export const VEDONO_NAV: readonly NavEntry[] = [
  { href: '/#vedono', labelKey: 'nav.vedono' },
  ...SITE_NAV.slice(1),
];

/** Resolves a site-absolute href against the deployment's base path. */
export function resolve(href: string): string {
  const base = import.meta.env.BASE_URL;
  return href.startsWith('/') ? `${base}${href.slice(1)}` : href;
}

/**
 * The menu with the branch and the area written into every link.
 *
 * Call it in render: it reads the context at that moment, and the pages that
 * show the menu re-render when the context changes.
 */
export function withContext(entries: readonly NavEntry[]): NavEntry[] {
  return entries.map((e) => ({
    ...e,
    href: contextHref(resolve(e.href)),
    children: e.children?.map(([href, key]) => [contextHref(resolve(href)), key] as const),
  }));
}
