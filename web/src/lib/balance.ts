// The arithmetic behind "how the district stock stands", kept out of the
// component so it can be tested: what is filled is what is left when the
// vacant and the dissolved are taken off the total, and each type is the
// same subtraction one level down.
import type { Snapshot } from '../types';

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

export function typeRows(snapshot: Snapshot | null): TypeRow[] {
  const byType = (snapshot?.national?.byType ?? {}) as
    Record<string, { total: number; vacant: number }>;
  return TYPE_ORDER
    .filter((key) => byType[key]?.total)
    .map((key) => {
      const { total, vacant } = byType[key];
      return {
        key,
        total,
        vacant,
        dissolved: 0,
        filled: Math.max(total - vacant, 0),
        rate: total ? vacant / total : 0,
      };
    });
}
