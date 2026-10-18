// The menu used to exist in four versions — the landing's, the standalone
// pages', the generated settlement pages' and the vedono variant — each with
// its own idea of which pages the site has. These tests hold them together.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import nav from './siteNav.json';
import srcList from './sources.json';
import hu from '../i18n/hu.json';
import en from '../i18n/en.json';

const root = join(import.meta.dirname, '..', '..');
const lookup = (dict: unknown, key: string): unknown =>
  key.split('.').reduce<unknown>(
    (o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined),
    dict,
  );

const allEntries = nav.entries;
const allKeys = allEntries.flatMap((e) => [e.labelKey, ...(e.children ?? []).map(([, k]) => k)]);
const allHrefs = allEntries.flatMap((e) => [e.href, ...(e.children ?? []).map(([h]) => h)]);

describe('site navigation', () => {
  it('names every page the site has, in the order of the zooms', () => {
    expect(allEntries.map((e) => e.href)).toEqual([
      '/', '/megye.html', '/jaras.html', '/telepules/', '/elemzo.html',
      '/szakellato.html', '/modszertan.html',
    ]);
  });

  it('keeps the register comparison out of the menu', () => {
    // eeszt.html is a working note about where two public registers disagree.
    // It is still built and still linked — from the sources list in the
    // footer — but it is not one of the site's seven pages.
    expect(allHrefs.some((h) => h.startsWith('/eeszt.html'))).toBe(false);
    const sources = readFileSync(
      join(root, 'src', 'lib', 'sources.json'), 'utf8');
    expect(sources).toContain('"/eeszt.html"');
  });

  it('has a label in both locales for every entry', () => {
    for (const key of allKeys) {
      expect(typeof lookup(hu, key), `hu: ${key}`).toBe('string');
      expect(typeof lookup(en, key), `en: ${key}`).toBe('string');
    }
  });

  it('keeps every href site-absolute, so it works from /telepules/<slug>/ too', () => {
    for (const href of allHrefs) expect(href.startsWith('/')).toBe(true);
  });

  it('points every page link at a page that is built', () => {
    const config = readFileSync(join(root, 'vite.config.ts'), 'utf8');
    for (const href of allHrefs) {
      const page = href.split('#')[0];
      if (!page.endsWith('.html')) continue;
      expect(config, `${page} is not an entry in vite.config.ts`)
        .toContain(`'${page.slice(1)}'`);
    }
  });

  it('is the file the generated settlement pages read', () => {
    const generator = readFileSync(join(root, 'scripts', 'settlement-pages.mjs'), 'utf8');
    expect(generator).toContain("'siteNav.json'");
    // the bar is built from those entries, not hand-written beside them
    expect(generator).toContain('nav.entries');
    expect(generator).toContain('${navBar(profile)}');
    expect(generator).not.toContain('class="topnav__group"><a href="/">');
  });

  it('links every source it names, in both locales', () => {
    for (const group of srcList.groups) {
      expect(typeof lookup(hu, `footer.src.${group.key}.title`),
        `hu title: ${group.key}`).toBe('string');
      expect(typeof lookup(en, `footer.src.${group.key}.title`),
        `en title: ${group.key}`).toBe('string');
      expect(group.items.length).toBeGreaterThan(0);
      for (const item of group.items) {
        // a source nobody can fetch is not a source
        expect(item.href, `${group.key}.${item.key}`).toMatch(/^(https:\/\/|\/)/);
        for (const [name, dict] of [['hu', hu], ['en', en]] as const) {
          expect(typeof lookup(dict, `footer.src.${group.key}.${item.key}`),
            `${name}: ${group.key}.${item.key}`).toBe('string');
        }
      }
    }
  });

  it('is the same list the generated pages render', () => {
    const generator = readFileSync(
      join(root, 'scripts', 'settlement-pages.mjs'), 'utf8');
    expect(generator).toContain("'sources.json'");
    expect(generator).toContain('sources.groups');
  });
});
