// The side menu of a page, read from pageSections.json: the same list the
// page's own anchors are written against, so a menu item cannot point at a
// section that is not there under another name.
import type { SideGroup } from '../components/SideNav';
import sections from './pageSections.json';

type Page = 'county' | 'district' | 'specialist';

export function sideGroups(page: Page): SideGroup[] {
  return (sections[page] as { key: string; items: string[] }[]).map((g) => ({
    titleKey: `sideNav.${page}.group.${g.key}`,
    items: g.items.map((id) => ({ id, labelKey: `sideNav.${page}.${id}` })),
  }));
}
