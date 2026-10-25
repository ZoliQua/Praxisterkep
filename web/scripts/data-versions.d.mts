/** Content hash (10 hex chars) of every JSON file under dir, keyed by its path relative to dir. */
export function dataVersions(dir: string): Record<string, string>;
