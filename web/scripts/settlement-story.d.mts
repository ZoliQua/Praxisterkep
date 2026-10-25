/** Types of settlement-story.mjs, for the tests that import it. */
export const MAX_SCENES: number;
export function monthsBetween(from: string, to: string): number;
export interface SettlementStory {
  locale: string;
  mascot: 'tooth' | 'house';
  title: string;
  ui: Record<string, string>;
  scenes: { say: string; mood?: string; mascot?: string; pic: { t: string } & Record<string, unknown> }[];
}
export function settlementStory(profile: unknown, o: {
  lang: 'hu' | 'en';
  t: (key: string, vars?: Record<string, string | number>) => string;
  label: (key: string) => string;
  months: string[];
  dataMonth: string;
  nationalAge?: unknown;
}): SettlementStory;
