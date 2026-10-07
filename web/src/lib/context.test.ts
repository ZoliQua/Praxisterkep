import { describe, expect, it } from 'vitest';
import {
  contextHref, readContext, writeContext, type SiteContext,
} from './context';

const ctx = (over: Partial<SiteContext> = {}): SiteContext =>
  ({ kind: 'dental', county: null, settlement: null, ...over });

describe('site context', () => {
  it('reads what the map has always written', () => {
    expect(readContext('?k=gp&m=Baranya')).toEqual(ctx({ kind: 'gp', county: 'Baranya' }));
    expect(readContext('')).toEqual(ctx());
  });

  it('refuses a settlement slug that is not one', () => {
    expect(readContext('?tel=szigetvar').settlement).toBe('szigetvar');
    expect(readContext('?tel=../etc/passwd').settlement).toBeNull();
    expect(readContext('?tel=Szigetvár').settlement).toBeNull();
  });

  it('leaves the default branch out of the address', () => {
    expect(writeContext('', ctx())).toBe('');
    expect(writeContext('', ctx({ kind: 'gp' }))).toBe('?k=gp');
  });

  it('keeps query parameters it does not own', () => {
    const q = writeContext('?ho=2026-08&szin=age', ctx({ kind: 'gp', county: 'Vas' }));
    expect(q).toContain('ho=2026-08');
    expect(q).toContain('szin=age');
    expect(q).toContain('k=gp');
    expect(q).toContain('m=Vas');
  });

  it('drops what is no longer selected', () => {
    expect(writeContext('?k=gp&m=Vas&tel=sarvar', ctx())).toBe('');
  });

  it('carries the context to another page, anchor and all', () => {
    const c = ctx({ kind: 'gp', county: 'Baranya' });
    expect(contextHref('elemzo.html#menetido', c))
      .toBe('elemzo.html?k=gp&m=Baranya#menetido');
    expect(contextHref('elemzo.html', c)).toBe('elemzo.html?k=gp&m=Baranya');
  });

  it('keeps the current query when the link stays on this page', () => {
    // an anchor on this page must not throw away the map's own state
    expect(contextHref('#nalam', ctx({ kind: 'gp' }), '?ho=2026-08'))
      .toBe('?ho=2026-08&k=gp#nalam');
  });

  it('survives a round trip', () => {
    const c = ctx({ kind: 'gp', county: 'Zala', settlement: 'zalaegerszeg' });
    expect(readContext(writeContext('', c))).toEqual(c);
  });
});
