import { describe, expect, it } from 'vitest';
import {
  contextHref, readContext, writeContext, EMPTY, type SiteContext,
} from './context';

const ctx = (over: Partial<SiteContext> = {}): SiteContext =>
  ({ kind: 'gp', county: null, settlement: null, dissolved: 'without',
    district: null, ...over });

describe('site context', () => {
  // Which branch a cold visitor lands on is a product decision, not an
  // accident of the code, so it is pinned here: an address with no branch in
  // it means GP, and dental has to say so.
  it('opens on the GP branch', () => {
    expect(EMPTY.kind).toBe('gp');
    expect(readContext('').kind).toBe('gp');
    expect(readContext('?k=dental').kind).toBe('dental');
    expect(readContext('?k=nonsense').kind).toBe('gp');
  });

  it('reads what the map has always written', () => {
    expect(readContext('?k=dental&m=Baranya'))
      .toEqual(ctx({ kind: 'dental', county: 'Baranya' }));
    expect(readContext('')).toEqual(ctx());
  });

  it('refuses a settlement slug that is not one', () => {
    expect(readContext('?tel=szigetvar').settlement).toBe('szigetvar');
    expect(readContext('?tel=../etc/passwd').settlement).toBeNull();
    expect(readContext('?tel=Szigetvár').settlement).toBeNull();
  });

  it('leaves the default branch out of the address', () => {
    expect(writeContext('', ctx())).toBe('');
    expect(writeContext('', ctx({ kind: 'dental' }))).toBe('?k=dental');
  });

  it('keeps query parameters it does not own', () => {
    const q = writeContext('?ho=2026-08&szin=age', ctx({ kind: 'dental', county: 'Vas' }));
    expect(q).toContain('ho=2026-08');
    expect(q).toContain('szin=age');
    expect(q).toContain('k=dental');
    expect(q).toContain('m=Vas');
  });

  it('carries the dissolved reading, and only when it is not the default', () => {
    expect(writeContext('', ctx())).toBe('');
    expect(writeContext('', ctx({ dissolved: 'with' }))).toBe('?msz=1');
    expect(readContext('?msz=1').dissolved).toBe('with');
    expect(readContext('').dissolved).toBe('without');
  });

  it('drops what is no longer selected', () => {
    expect(writeContext('?k=dental&m=Vas&tel=sarvar', ctx())).toBe('');
  });

  it('carries the context to another page, anchor and all', () => {
    const c = ctx({ kind: 'dental', county: 'Baranya' });
    expect(contextHref('elemzo.html#menetido', c))
      .toBe('elemzo.html?k=dental&m=Baranya#menetido');
    expect(contextHref('elemzo.html', c)).toBe('elemzo.html?k=dental&m=Baranya');
  });

  it('keeps the current query when the link stays on this page', () => {
    // an anchor on this page must not throw away the map's own state
    expect(contextHref('#nalam', ctx({ kind: 'dental' }), '?ho=2026-08'))
      .toBe('?ho=2026-08&k=dental#nalam');
  });

  it('survives a round trip', () => {
    const c = ctx({ kind: 'dental', county: 'Zala', settlement: 'zalaegerszeg' });
    expect(readContext(writeContext('', c))).toEqual(c);
  });
});
