// The one selection the whole site shares: which branch, which county, which
// settlement. Until now each page kept its own — the landing in the store and
// the URL, the analysis page in a local useState, the specialist page not at
// all — so choosing "háziorvosi" on the map and walking to the analyses
// silently handed back dental numbers.
//
// It lives in two places on purpose: in the URL, so every link and every
// shared address carries it (and the generated static settlement pages can
// write it without running any of this code), and in a tiny store, so every
// page reacts to a change without a reload.
import { create } from 'zustand';
import type { PraxisKind } from '../types';

export interface SiteContext {
  kind: PraxisKind;
  /** county name as the snapshots spell it, or null for the whole country */
  county: string | null;
  /** settlement slug (the key of its own page), or null */
  settlement: string | null;
}

// 'k' and 'm' are what the map has always written, so old links keep working;
// 't' was already taken by the praxis-type filter, hence 'tel'.
export const CONTEXT_KEYS = { kind: 'k', county: 'm', settlement: 'tel' } as const;

export const EMPTY: SiteContext = { kind: 'dental', county: null, settlement: null };

const SLUG_RE = /^[a-z0-9-]{2,60}$/;

export function readContext(search: string = window.location.search): SiteContext {
  const p = new URLSearchParams(search);
  const kind = p.get(CONTEXT_KEYS.kind);
  const settlement = p.get(CONTEXT_KEYS.settlement);
  return {
    kind: kind === 'gp' ? 'gp' : 'dental',
    county: p.get(CONTEXT_KEYS.county) || null,
    settlement: settlement && SLUG_RE.test(settlement) ? settlement : null,
  };
}

/** The query string of `search` with the context written into it. */
export function writeContext(search: string, ctx: SiteContext): string {
  const p = new URLSearchParams(search);
  const setOr = (key: string, value: string | null) => {
    if (value) p.set(key, value);
    else p.delete(key);
  };
  // dental is the default everywhere, so it is left out of the address
  setOr(CONTEXT_KEYS.kind, ctx.kind === 'gp' ? 'gp' : null);
  setOr(CONTEXT_KEYS.county, ctx.county);
  setOr(CONTEXT_KEYS.settlement, ctx.settlement);
  const q = p.toString();
  return q ? `?${q}` : '';
}

interface ContextState extends SiteContext {
  setKind: (kind: PraxisKind) => void;
  setCounty: (county: string | null) => void;
  setSettlement: (settlement: string | null) => void;
  setContext: (patch: Partial<SiteContext>) => void;
  clear: () => void;
}

/** Keeps the address bar in step without adding a history entry per click. */
function syncUrl(ctx: SiteContext) {
  if (typeof window === 'undefined') return;
  const q = writeContext(window.location.search, ctx);
  window.history.replaceState(
    null, '', `${window.location.pathname}${q}${window.location.hash}`,
  );
}

export const useContextStore = create<ContextState>((set, get) => ({
  ...(typeof window === 'undefined' ? EMPTY : readContext()),
  setKind: (kind) => get().setContext({ kind }),
  setCounty: (county) => get().setContext({ county }),
  setSettlement: (settlement) => get().setContext({ settlement }),
  setContext: (patch) => {
    const next = { ...contextOf(get()), ...patch };
    set(next);
    syncUrl(next);
  },
  clear: () => get().setContext({ county: null, settlement: null }),
}));

function contextOf(s: SiteContext): SiteContext {
  return { kind: s.kind, county: s.county, settlement: s.settlement };
}

/** The context as a plain object, for building links outside React. */
export function currentContext(): SiteContext {
  return contextOf(useContextStore.getState());
}

/**
 * A link that carries the context on.
 *
 * `href` may be a page ("elemzo.html"), a page with an anchor
 * ("elemzo.html#menetido") or a bare anchor ("#nalam"); the context lands in
 * the query string, before the anchor, where the next page will read it.
 */
export function contextHref(
  href: string,
  ctx: SiteContext = currentContext(),
  search: string = typeof window === 'undefined' ? '' : window.location.search,
): string {
  const [path, hash] = splitHash(href);
  // a link that stays on this page keeps its query: the map's month, filters
  // and colouring live there, and a menu click must not wipe them
  const q = writeContext(path === '' || samePage(path) ? search : '', ctx);
  return `${path}${q}${hash}`;
}

/** Whether this href points at the page the browser is already showing. */
function samePage(path: string): boolean {
  if (typeof window === 'undefined') return false;
  const here = window.location.pathname;
  if (path === here) return true;
  // "/" and "/index.html" are the same page, and so are "/x/" and "/x/index.html"
  const norm = (p: string) => p.replace(/index\.html$/, '');
  return norm(path) === norm(here);
}

function splitHash(href: string): [string, string] {
  const i = href.indexOf('#');
  return i < 0 ? [href, ''] : [href.slice(0, i), href.slice(i)];
}

/** React-facing version: re-renders the caller when the context changes. */
export function useContextHref(): (href: string) => string {
  // field by field: a selector returning a fresh object would hand the store
  // a new snapshot on every render
  const kind = useContextStore((s) => s.kind);
  const county = useContextStore((s) => s.county);
  const settlement = useContextStore((s) => s.settlement);
  return (href: string) => contextHref(href, { kind, county, settlement });
}
