// The analysis page in parts. elemzo.html used to be one page of twenty-odd
// sections, each with its own data file and several with a map; it is now a
// short overview and six parts, one group of pageSections.json each, the
// part named in the query (?resz=valtozas).
//
// Every link the site ever handed out reads /elemzo.html#<section>, from the
// menu, from the other pages and from the 3177 static settlement pages, so
// the anchor decides first: #menetido opens the access part wherever it is
// clicked, and #csoport-<group> opens a part at its top. ?resz= is only what
// the address bar keeps once a part is open, for sharing and for the sitemap.
import sections from './pageSections.json';

export interface AnalysisPart { key: string; slug: string; items: string[] }

export const PARTS = sections.analysis as AnalysisPart[];

export const PART_PARAM = 'resz';

const GROUP_PREFIX = 'csoport-';

/** The part an anchor belongs to: a group's own heading or one of its sections. */
export function partOfHash(hash: string): AnalysisPart | null {
  let id = hash.replace(/^#/, '');
  try { id = decodeURIComponent(id); } catch { /* keep it as typed */ }
  if (!id) return null;
  if (id.startsWith(GROUP_PREFIX)) {
    const key = id.slice(GROUP_PREFIX.length);
    return PARTS.find((p) => p.key === key) ?? null;
  }
  return PARTS.find((p) => p.items.includes(id)) ?? null;
}

/** The part to show for an address: the anchor first, then ?resz=; null is the overview. */
export function resolvePart(search: string, hash: string): AnalysisPart | null {
  const slug = new URLSearchParams(search).get(PART_PARAM);
  return partOfHash(hash) ?? PARTS.find((p) => p.slug === slug) ?? null;
}

/** The query with the part written in (or taken out, for the overview). */
export function withPart(search: string, part: AnalysisPart | null): string {
  const q = new URLSearchParams(search);
  if (part) q.set(PART_PARAM, part.slug);
  else q.delete(PART_PARAM);
  const s = q.toString();
  return s ? `?${s}` : '';
}

/** The anchor that opens a part at its top. */
export const partAnchor = (part: AnalysisPart) => `#${GROUP_PREFIX}${part.key}`;
