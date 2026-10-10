// "Hány embernek van ennél messzebb?" — the travel-time section turned from a
// picture into a question with a dial.
//
// The medians and the bands answer the country's question; this answers the
// one a reader actually brings: pick the number of minutes you think is
// acceptable, and see who lives outside it. The bands are fixed at 10/20/30
// minutes, which is the right summary and the wrong tool — nobody's threshold
// is exactly thirty.
import type { Layer, TravelRaw, TravelSettlement } from './mobility';

export interface Beyond {
  /** the threshold these numbers answer for, in minutes */
  minutes: number;
  settlements: number;
  population: number;
  /** of the settlements the layer could measure at all */
  ofSettlements: number;
  ofPopulation: number;
  /** the worst few, for naming names */
  worst: { settlement: string; county: string; minutes: number; population: number }[];
  /** settlements the road graph could not reach at all */
  unreachable: number;
}

export const THRESHOLDS = [5, 10, 15, 20, 25, 30, 40, 50, 60] as const;

/**
 * Where the dial starts, per layer. One number cannot serve all of them: a
 * GP surgery twenty minutes away is a rarity, a hospital twenty minutes away
 * is a good day. These are the thresholds at which each layer has something
 * to say, not standards — nobody has set those.
 */
const DEFAULTS: Partial<Record<Layer, number>> = {
  gp: 10, dental: 15, pharmacy: 10, oncall: 20, ambulance: 15,
  inpatient: 30, outpatient: 25, gyse: 30,
};
export const DEFAULT_THRESHOLD = 20;

export function defaultThreshold(layer: Layer): number {
  return DEFAULTS[layer] ?? DEFAULT_THRESHOLD;
}

const value = (row: TravelSettlement, layer: Layer): number | null => {
  const v = row[`${layer}Min`];
  return typeof v === 'number' ? v : null;
};

export function beyond(
  data: TravelRaw | null, layer: Layer, minutes: number, worstCount = 5,
): Beyond | null {
  const rows = data?.settlements;
  if (!rows?.length) return null;

  let settlements = 0;
  let population = 0;
  let ofSettlements = 0;
  let ofPopulation = 0;
  let unreachable = 0;
  const over: TravelSettlement[] = [];

  for (const row of rows) {
    const v = value(row, layer);
    if (v === null) {
      unreachable += 1;
      continue;
    }
    ofSettlements += 1;
    ofPopulation += row.population ?? 0;
    if (v > minutes) {
      settlements += 1;
      population += row.population ?? 0;
      over.push(row);
    }
  }

  const worst = over
    .sort((a, b) => (value(b, layer) ?? 0) - (value(a, layer) ?? 0))
    .slice(0, worstCount)
    .map((row) => ({
      settlement: row.settlement,
      county: row.county,
      minutes: value(row, layer) ?? 0,
      population: row.population ?? 0,
    }));

  return { minutes, settlements, population, ofSettlements, ofPopulation,
    worst, unreachable };
}

/**
 * The same question asked of every threshold at once, for the little curve
 * under the dial: how the affected population falls as the minutes rise.
 */
export function curve(
  data: TravelRaw | null, layer: Layer,
): { minutes: number; population: number }[] {
  return THRESHOLDS.map((minutes) => ({
    minutes,
    population: beyond(data, layer, minutes, 0)?.population ?? 0,
  }));
}
