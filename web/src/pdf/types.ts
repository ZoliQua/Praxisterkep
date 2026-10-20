// What a PDF export is made of: the reader's choices, and the report they
// produce before any PDF library sees it. The report is plain data, so the
// builders can be tested without rendering a page.

export type Level = 'county' | 'district' | 'settlement' | 'analysis' | 'europe';
export type Lang = 'hu' | 'en';
export type FontKey = 'plex' | 'serif' | 'roboto';
export type SizeKey = 'small' | 'normal' | 'large';
export type PaletteKey = 'site' | 'colorblind' | 'gray' | 'blue';
export type ChartSize = 'compact' | 'normal' | 'large';
export type BranchChoice = 'gp' | 'dental' | 'both';

export interface PdfOptions {
  lang: Lang;
  branch: BranchChoice;
  /** section ids, in the order the level offers them */
  sections: string[];
  font: FontKey;
  size: SizeKey;
  palette: PaletteKey;
  /** gridlines behind the bars and lines */
  grid: boolean;
  /** the number written at the end of each bar */
  labels: boolean;
  chartSize: ChartSize;
  orientation: 'portrait' | 'landscape';
  /** how many settlements the list carries; 0 = all of them */
  settlementLimit: number;
  /** sources, data month and the method notes at the end */
  notes: boolean;
  pageNumbers: boolean;
  /** the European report: which countries are compared, and which one leads */
  group?: 'all' | 'cee' | 'v4';
  focus?: string;
}

export type Block =
  | { kind: 'p'; text: string }
  | { kind: 'note'; text: string }
  /** a heading inside a section: one indicator of the European report */
  | { kind: 'h3'; text: string }
  /** a line that must not be missed: the data month at the end */
  | { kind: 'highlight'; text: string }
  | { kind: 'facts'; rows: [string, string][] }
  | { kind: 'chart'; title: string; svg: string; width: number; caption: string }
  | { kind: 'table'; head: string[]; rows: string[][]; align?: ('left' | 'right')[];
      widths?: (number | '*' | 'auto')[] }
  | { kind: 'cards'; cards: Card[] };

/** One of the headline figures, drawn side by side as on the county page. */
export interface Card {
  title: string;
  /** the ring, as SVG */
  svg: string;
  size: number;
  /** the big figure, e.g. "43 / 301" */
  value: string;
  label: string;
  legend: { color: string; text: string }[];
  sub?: string;
}

export interface Section { id: string; title: string; blocks: Block[] }

export interface Report {
  /** e.g. "Veszprém" */
  title: string;
  /** e.g. "County report · GP and dental primary care" */
  subtitle: string;
  sections: Section[];
  /** the area on the map of the country, under the title */
  map?: { svg: string; width: number; height: number; caption: string };
  /** a short slug for the file name */
  fileSlug: string;
}

/** The sections each level offers, in reading order. */
export const SECTIONS: Record<Level, string[]> = {
  county: ['summary', 'age', 'care', 'churn', 'access', 'ranking', 'outcomes', 'forecast',
    'districts', 'settlements', 'notes'],
  district: ['summary', 'age', 'care', 'access', 'development', 'ranking', 'outcomes',
    'forecast', 'settlements', 'notes'],
  settlement: ['summary', 'care', 'access', 'transit', 'age', 'index', 'living',
    'jobseekers', 'change', 'pharmacies', 'notes'],
  analysis: ['national', 'trend', 'counties', 'districts', 'survival', 'forecast',
    'correlations', 'grid', 'grants', 'emergency', 'notes'],
  // the European report's parts are its indicators, read from europe.json;
  // these are the ones around them
  europe: ['overview', 'migration', 'notes'],
};

/** A choice list the dialog shows when a level's parts come from its data. */
export interface Catalog { groups: { title: string; items: { id: string; label: string }[] }[] }

export function defaultOptions(level: Level, lang: Lang, branch: BranchChoice = 'both'): PdfOptions {
  return {
    lang, branch,
    sections: SECTIONS[level].filter((s) => s !== 'notes'),
    font: 'plex', size: 'normal', palette: 'site',
    grid: true, labels: true, chartSize: 'normal', orientation: 'portrait',
    settlementLimit: 25, notes: true, pageNumbers: true,
  };
}
