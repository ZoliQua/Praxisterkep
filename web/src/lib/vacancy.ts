// One reading of "how many districts have no doctor", shared by every number
// on the site that answers it.
//
// NEAK publishes two lists. One names the districts with no contracted
// physician; the other names the districts whose contract ended outright
// (megszűnt). The site used to add them together everywhere, without saying
// so. Both readings are defensible — a resident of a dissolved district is
// just as without a contracted doctor — but they are different numbers, and
// the reader is now the one who picks. This is where the picking happens, so
// that the figure, its rate and its affected population always come from the
// same choice.
import type { DissolvedMode } from './context';

/** What every aggregate in the snapshots carries, national or county. */
export interface VacancySource {
  vacant: number;
  dissolved: number;
  total?: number | null;
  totalDistricts?: number | null;
  populationVacant?: number;
  populationDissolved?: number;
  vacancyRate?: number | null;
}

export interface VacancyParts {
  /** districts counted as vacant under the current reading */
  count: number;
  /** the districts of the branch, or null where the denominator is unknown */
  total: number | null;
  /** count / total, or null without a denominator */
  rate: number | null;
  /** residents of those districts */
  population: number;
  /** the dissolved districts, whether or not they are counted above */
  dissolved: number;
  /** whether this reading counts them */
  withDissolved: boolean;
}

export function vacancyOf(
  src: VacancySource | null | undefined,
  mode: DissolvedMode,
): VacancyParts {
  const withDissolved = mode === 'with';
  const dissolved = src?.dissolved ?? 0;
  const count = (src?.vacant ?? 0) + (withDissolved ? dissolved : 0);
  const total = src?.total ?? src?.totalDistricts ?? null;
  const population = (src?.populationVacant ?? 0)
    + (withDissolved ? src?.populationDissolved ?? 0 : 0);
  return {
    count,
    total,
    // the published rate already counts the dissolved, so it is only reused
    // for that reading; the other is worked out here
    rate: total ? count / total : withDissolved ? src?.vacancyRate ?? null : null,
    population,
    dissolved,
    withDissolved,
  };
}

/** The share of a county's districts that are vacant, under one reading. */
export function vacancyRateOf(src: VacancySource | null | undefined,
  mode: DissolvedMode): number | null {
  return vacancyOf(src, mode).rate;
}
