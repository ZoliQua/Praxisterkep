// Light or dark, and the colour scheme of the charts and maps. Both are a
// per-browser convenience kept in localStorage ("theme", "palette"); dark and
// the site's own colours are the default. The choice is applied before the
// first paint by the inline script every page carries in its <head>
// (THEME_BOOT below, also written into the static settlement pages), as
// data-theme and data-palette on <html>; index.css holds the tokens of each.
// Code that draws on a canvas or hands colours to MapLibre reads them with
// cssColor() and draws again on THEME_EVENT.
import { useEffect, useState } from 'react';

export type Theme = 'dark' | 'light';
export type PaletteKey = 'alap' | 'okabe' | 'viridis' | 'magma' | 'tableau' | 'kek' | 'kontraszt';

export interface Palette {
  key: PaletteKey;
  /** the dental accent, the GP accent, vacancy warm and its softer twin */
  swatches: [string, string, string, string];
}

/** The order of the picker; labels live in i18n under theme.palettes.<key>. */
export const PALETTES: Palette[] = [
  { key: 'alap', swatches: ['#4fd6c2', '#6ea8ff', '#ff7a59', '#ffb454'] },
  { key: 'okabe', swatches: ['#2fc79a', '#56b4e9', '#e8743b', '#f0e442'] },
  { key: 'viridis', swatches: ['#5ec962', '#3fa6c9', '#fde725', '#b5de2b'] },
  { key: 'magma', swatches: ['#fb8f5a', '#fdc366', '#ef4f7a', '#fcd57a'] },
  { key: 'tableau', swatches: ['#76b7b2', '#6f9bd1', '#e15759', '#f28e2b'] },
  { key: 'kek', swatches: ['#7fb2ff', '#7fb2ff', '#f4a261', '#f6c88f'] },
  { key: 'kontraszt', swatches: ['#00e5ff', '#ffea00', '#ff3d71', '#ff9f1c'] },
];

export const THEME_KEY = 'theme';
export const PALETTE_KEY = 'palette';
/** Fired on window when the theme or the palette changes. */
export const THEME_EVENT = 'pt:theme';

export function isTheme(v: unknown): v is Theme {
  return v === 'dark' || v === 'light';
}
export function isPalette(v: unknown): v is PaletteKey {
  return typeof v === 'string' && PALETTES.some((p) => p.key === v);
}

/** The inline <head> script: applies the stored choice before anything paints.
 *  Kept free of imports so it can be inlined as it is (the html entries carry
 *  it verbatim, and scripts/settlement-pages.mjs writes it into the static
 *  pages — lib/theme.test.ts checks that they agree).
 *
 *  It also keeps the link back to the private analysis site: a link from
 *  belso.praxisterkep.hu arrives with ?belso=true, which is remembered for the
 *  visit (sessionStorage) and marks <html data-internal>; the CSS then shows
 *  the "Belső" menu entry and moves Módszertan to the footer. Nothing is sent
 *  anywhere — it only decides which links the page shows. */
export const THEME_BOOT = `(function(){var d=document.documentElement;try{var s=localStorage,t=s.getItem('theme'),p=s.getItem('palette');d.dataset.theme=t==='light'?'light':'dark';if(p&&/^[a-z]+$/.test(p))d.dataset.palette=p;}catch(e){d.dataset.theme='dark';}try{var b=new URLSearchParams(location.search).get('belso'),ss=sessionStorage;if(b==='true')ss.setItem('belso','1');else if(b==='false')ss.removeItem('belso');if(ss.getItem('belso')==='1')d.dataset.internal='1';}catch(e){}})();`;

/** Where the "Belső" menu entry leads: the private analysis site. */
export const INTERNAL_URL = 'https://belso.praxisterkep.hu/';

export function currentTheme(): Theme {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

export function currentPalette(): PaletteKey {
  if (typeof document === 'undefined') return 'alap';
  const p = document.documentElement.dataset.palette;
  return isPalette(p) ? p : 'alap';
}

function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // private mode, blocked storage: the choice lasts for this page only
  }
}

export function setTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  store(THEME_KEY, theme);
  window.dispatchEvent(new Event(THEME_EVENT));
}

export function setPalette(key: PaletteKey) {
  document.documentElement.dataset.palette = key;
  store(PALETTE_KEY, key);
  window.dispatchEvent(new Event(THEME_EVENT));
}

/** A colour token as the browser resolved it, for canvas and MapLibre. */
export function cssColor(name: string, fallback = '#888888', el: Element | null = null): string {
  if (typeof document === 'undefined') return fallback;
  const v = getComputedStyle(el ?? document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/** A number that changes whenever the theme or the palette does: put it in a
 *  dependency list to draw again. */
export function useThemeTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const again = () => setTick((n) => n + 1);
    window.addEventListener(THEME_EVENT, again);
    return () => window.removeEventListener(THEME_EVENT, again);
  }, []);
  return tick;
}

/** A colour as a plain string: `var(--x)` (or `var(--x, fallback)`) is
 *  resolved against the page, anything else passes through. For the places
 *  that cannot take a CSS variable: MapLibre, canvas, colour arithmetic. */
export function resolveColor(color: string): string {
  const m = /^var\((--[\w-]+)(?:\s*,\s*([^)]+))?\)$/.exec(color.trim());
  return m ? cssColor(m[1], m[2]?.trim() ?? '#888888') : color;
}
