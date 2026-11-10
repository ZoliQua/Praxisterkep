import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CANONICAL_BOOT } from './seo';

const web = resolve(__dirname, '..', '..');
// the pages a search engine should index; embed.html says noindex itself
const PAGES = ['index', 'elemzo', 'europa', 'eeszt', 'szakellato', 'modszertan', 'megye', 'jaras', 'adatkezeles', 'media', 'tek-nelkul'];

interface Link { rel: string; href: string; hreflang?: string }

/** Runs the boot script against an address; returns the links it adds. */
function linksFor(address: string): Link[] {
  const url = new URL(address, 'https://praxisterkep.hu');
  const links: Link[] = [];
  const document = {
    head: { appendChild: (l: Link) => links.push({ ...l }) },
    createElement: () => ({}) as Link,
  };
  new Function('location', 'document', CANONICAL_BOOT)(url, document);
  return links;
}
const canonical = (address: string) => linksFor(address).find((l) => l.rel === 'canonical')?.href;

describe('canonical addresses', () => {
  it('every indexable page entry carries the script', () => {
    for (const page of PAGES) {
      const html = readFileSync(resolve(web, `${page}.html`), 'utf8');
      expect(html, page).toContain(`<script>${CANONICAL_BOOT}</script>`);
      // a second, static canonical would contradict it
      expect(html.match(/rel="canonical"/g), page).toBeNull();
    }
  });

  it('drops the reader’s place, which the menu carries from page to page', () => {
    expect(canonical('/?m=Zala&tel=bekescsaba')).toBe('https://praxisterkep.hu/');
    expect(canonical('/index.html')).toBe('https://praxisterkep.hu/');
    expect(canonical('/elemzo.html?m=Baranya&tel=sumony&jar=Encsi&k=dental'))
      .toBe('https://praxisterkep.hu/elemzo.html');
  });

  it('keeps what the county and the járás page are about', () => {
    expect(canonical('/megye.html?m=Gy%C5%91r-Moson-Sopron&tel=veszpremvarsany&jar=Z%C3%A1honyi'))
      .toBe('https://praxisterkep.hu/megye.html?m=Gy%C5%91r-Moson-Sopron');
    expect(canonical('/jaras.html?m=B%C3%A9k%C3%A9s&tel=bekescsaba&jar=Devecseri'))
      .toBe('https://praxisterkep.hu/jaras.html?jar=Devecseri');
    expect(canonical('/megye.html')).toBe('https://praxisterkep.hu/megye.html');
    expect(canonical('/elemzo.html?k=dental&resz=elerhetoseg&m=Vas'))
      .toBe('https://praxisterkep.hu/elemzo.html?resz=elerhetoseg');
  });

  it('keeps the language, and names both', () => {
    expect(canonical('/jaras.html?m=Baranya&tel=sumony&lang=en'))
      .toBe('https://praxisterkep.hu/jaras.html?lang=en');
    expect(linksFor('/megye.html?m=Vas&lang=en').filter((l) => l.rel === 'alternate')).toEqual([
      { rel: 'alternate', href: 'https://praxisterkep.hu/megye.html?m=Vas', hreflang: 'hu' },
      { rel: 'alternate', href: 'https://praxisterkep.hu/megye.html?m=Vas&lang=en', hreflang: 'en' },
      { rel: 'alternate', href: 'https://praxisterkep.hu/megye.html?m=Vas', hreflang: 'x-default' },
    ]);
  });
});
