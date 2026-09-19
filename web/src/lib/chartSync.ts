// Shared hover month across every statistics chart: hovering one chart
// shows the same month's crosshair + tooltip on all of them.
import { useSyncExternalStore } from 'react';

let current: string | null = null;
const subs = new Set<() => void>();

export function setSyncMonth(m: string | null): void {
  if (m === current) return;
  current = m;
  subs.forEach((f) => f());
}

export function useSyncMonth(): string | null {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => current,
  );
}
