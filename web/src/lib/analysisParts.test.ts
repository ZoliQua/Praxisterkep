import { describe, expect, it } from 'vitest';
import { PARTS, partAnchor, partOfHash, resolvePart, withPart } from './analysisParts';
import nav from './siteNav.json';

const part = (key: string) => PARTS.find((p) => p.key === key)!;

describe('the analysis parts', () => {
  it('give every part its own slug and every section one part', () => {
    expect(new Set(PARTS.map((p) => p.slug)).size).toBe(PARTS.length);
    const ids = PARTS.flatMap((p) => p.items);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('open the part an old section link points into', () => {
    expect(partOfHash('#menetido')).toBe(part('access'));
    expect(partOfHash('#tamogatasok')).toBe(part('future'));
    expect(partOfHash('#csoport-changes')).toBe(part('changes'));
    expect(partOfHash('#nincs-ilyen')).toBeNull();
    expect(partOfHash('')).toBeNull();
  });

  it('let the anchor win over the query, and fall back to the overview', () => {
    expect(resolvePart('?resz=valtozas&k=dental', '#busz')).toBe(part('access'));
    expect(resolvePart('?resz=valtozas', '')).toBe(part('changes'));
    expect(resolvePart('?resz=valtozas', '#nincs-ilyen')).toBe(part('changes'));
    expect(resolvePart('?k=dental', '')).toBeNull();
    expect(resolvePart('?resz=nincs', '')).toBeNull();
  });

  it('write the part into the query and take it out again', () => {
    expect(withPart('?k=dental', part('future'))).toBe('?k=dental&resz=varhato');
    expect(withPart('?resz=varhato&k=dental', null)).toBe('?k=dental');
    expect(withPart('?resz=varhato', null)).toBe('');
    expect(partAnchor(part('districts'))).toBe('#csoport-districts');
  });

  it('can place every analysis link of the menu', () => {
    const entry = nav.entries.find((e) => e.href === '/elemzo.html')!;
    for (const [href] of entry.children ?? []) {
      expect(partOfHash(href.split('#')[1] ?? ''), href).not.toBeNull();
    }
  });
});
