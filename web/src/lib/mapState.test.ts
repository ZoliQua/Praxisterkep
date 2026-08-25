import { describe, expect, it } from 'vitest';
import { readMapState, writeMapState } from './mapState';

describe('map URL state codec', () => {
  it('round-trips a full state', () => {
    const q = writeMapState('', {
      kind: 'gp', county: 'Zala', type: 'child', view: 'columns',
      metric: 'population', month: '2020-06', minYears: 5, colorMode: 'age',
    });
    expect(readMapState(q)).toEqual({
      kind: 'gp', county: 'Zala', type: 'child', view: 'columns',
      metric: 'population', month: '2020-06', minYears: 5, colorMode: 'age',
    });
  });
  it('omits defaults and clears stale params', () => {
    const q = writeMapState('?k=gp&m=Zala&kor=5&x=keep', {});
    expect(q).toBe('?x=keep');
    expect(readMapState(q)).toEqual({});
  });
  it('rejects invalid values', () => {
    expect(readMapState('?ho=2020-6&kor=-2&t=alien')).toEqual({});
  });
});
