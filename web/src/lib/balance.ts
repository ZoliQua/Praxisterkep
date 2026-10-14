// The arithmetic behind "how the district stock stands", kept out of the
// component so it can be tested: what is filled is what is left when the
// vacant and the dissolved are taken off the total, and each type is the
// same subtraction one level down.
import type { Snapshot } from '../types';
import type { DissolvedMode } from './context';

export interface BalanceParts {
  total: number;
  filled: number;
  vacant: number;
  dissolved: number;
}

export interface TypeRow extends BalanceParts {
  key: string;
  /** vacant as a share of this type's districts */
  rate: number;
}

/** the order the types are shown in; the snapshot decides which exist */
export const TYPE_ORDER = ['adult', 'child', 'mixed', 'school'] as const;

export function stockOf(snapshot: Snapshot | null): BalanceParts | null {
  const n = snapshot?.national;
  const total = n?.totalDistricts ?? 0;
  if (!n || !total) return null;
  const vacant = n.vacant ?? 0;
  const dissolved = n.dissolved ?? 0;
  return { total, vacant, dissolved, filled: Math.max(total - vacant - dissolved, 0) };
}

/**
 * The stock split by district type, under one reading of "vacant".
 *
 * The snapshot counts the types from the registry, and a dissolved district
 * is gone from the registry — so this table has always been the "without
 * dissolved" reading, whatever the headline above it said. The other reading
 * is exact all the same: the praxis list keeps the type of every dissolved
 * district, so they can be put back into both the numerator and the
 * denominator of their own type, which is where they belong.
 */
export function typeRows(snapshot: Snapshot | null,
  mode: DissolvedMode = 'with'): TypeRow[] {
  const byType = (snapshot?.national?.byType ?? {}) as
    Record<string, { total: number; vacant: number }>;
  const dissolvedByType = new Map<string, number>();
  for (const p of snapshot?.praxes ?? []) {
    if (p.status !== 'dissolved') continue;
    dissolvedByType.set(p.type, (dissolvedByType.get(p.type) ?? 0) + 1);
  }
  const counted = mode === 'with';
  return TYPE_ORDER
    .filter((key) => byType[key]?.total)
    .map((key) => {
      const registry = byType[key];
      const dissolved = dissolvedByType.get(key) ?? 0;
      const total = registry.total + (counted ? dissolved : 0);
      const vacant = registry.vacant + (counted ? dissolved : 0);
      return {
        key,
        total,
        vacant,
        dissolved,
        filled: Math.max(registry.total - registry.vacant, 0),
        rate: total ? vacant / total : 0,
      };
    });
}
