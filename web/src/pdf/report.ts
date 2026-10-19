// The contents of a PDF report, as data: one builder per level.
//
// Every number comes from the same JSON the page reads, and every sentence
// is a template in i18n with the numbers put in — nothing here judges or
// explains beyond what the figures say. Three rules of the site hold here as
// on the page: a vacant district is not an unserved one (the care section
// says so every time), names appear only where the page shows them (the
// contracted doctor of a filled district), and a value that is missing is
// written as missing, not as zero.
import type { CountiesRaw, CountyAggregateRow, SettlementRow, State } from '../lib/counties';
import type { DistrictRow, DistrictsRaw } from '../lib/districts';
import type { OutcomeCounty, OutcomeDistrict, OutcomesRaw } from '../lib/outcomes';
import { aspect, project, type ShapeFeature } from '../lib/projection';
import {
  areaMap, barChart, donut, lineChart, PALETTES, stackedBar, type BarRow, type ChartStyle,
} from './charts';
import { month, num, pct, signed, slugify } from './format';
import type { Block, Card, Lang, PdfOptions, Report, Section } from './types';

export type Translate = (key: string, params?: Record<string, string | number>) => string;

type Branch = 'gp' | 'dental';

export interface Ctx {
  T: Translate;
  o: PdfOptions;
  /** the width the charts are drawn at, in points */
  width: number;
  /** the PDF's name for the chosen font, written into the charts */
  font: string;
}

const branches = (o: PdfOptions): Branch[] => (o.branch === 'both' ? ['gp', 'dental'] : [o.branch]);

function style(c: Ctx, width = c.width): ChartStyle {
  return { width, palette: PALETTES[c.o.palette], font: c.font, grid: c.o.grid,
    labels: c.o.labels, size: c.o.chartSize };
}

function chart(c: Ctx, title: string, made: { svg: string }, caption: string,
  width = c.width): Block {
  return { kind: 'chart', title, svg: made.svg, width, caption };
}

const want = (c: Ctx, id: string) => c.o.sections.includes(id);

/** Rank of `value` among `values`, 1 = the smallest; null when it has none. */
export function rankAscending(values: (number | null | undefined)[], value: number | null | undefined):
  number | null {
  if (value === null || value === undefined) return null;
  return values.filter((v): v is number => v !== null && v !== undefined && v < value).length + 1;
}

export function median(values: (number | null | undefined)[]): number | null {
  const v = values.filter((x): x is number => x !== null && x !== undefined && Number.isFinite(x))
    .sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/** The compact settlement rows of a county or district, as objects. */
export function decodeRows(fields: string[], rows: unknown[][] | undefined): SettlementRow[] {
  return (rows ?? []).map((r) => Object.fromEntries(fields.map((f, i) => [f, r[i]])) as unknown as SettlementRow);
}

const BAND_ORDER: Record<string, number> = { kiemelt: 0, magas: 1, kozepes: 2, alacsony: 3 };

// ---------------------------------------------------------------- shared parts

interface AgeSplit { young: number; working: number; old: number; total: number }

function ageSection(c: Ctx, name: string, age: AgeSplit | undefined, nat: AgeSplit | null): Section | null {
  if (!age || !age.total) return null;
  const { T, o } = c;
  const parts = [
    { label: T('pdf.age.young'), value: age.young },
    { label: T('pdf.age.working'), value: age.working },
    { label: T('pdf.age.old'), value: age.old },
  ];
  const blocks: Block[] = [
    { kind: 'p', text: T('pdf.age.text', {
      name, old: pct(o.lang, age.old / age.total), young: pct(o.lang, age.young / age.total),
      national: nat ? pct(o.lang, nat.old / nat.total) : '–' }) },
    chart(c, T('pdf.age.chartTitle', { name }),
      stackedBar(parts, style(c), (s) => pct(o.lang, s, 1)), T('pdf.age.caption')),
  ];
  if (nat) {
    blocks.push(chart(c, T('pdf.age.chartNational'), stackedBar([
      { label: T('pdf.age.young'), value: nat.young },
      { label: T('pdf.age.working'), value: nat.working },
      { label: T('pdf.age.old'), value: nat.old },
    ], style(c), (s) => pct(o.lang, s, 1)), T('pdf.age.captionNational')));
  }
  return { id: 'age', title: T('pdf.section.age'), blocks };
}

interface StateCounts {
  settlements: number;
  gpFilled: number; gpPartial: number; gpVacantOnly: number; gpAbsent: number;
  dentalFilled: number; dentalPartial: number; dentalVacantOnly: number; dentalAbsent: number;
  gpDistricts?: { total: number; vacant: number; dissolved: number; longTerm: number; rate: number | null };
  dentalDistricts?: { total: number; vacant: number; dissolved: number; longTerm: number; rate: number | null };
}

function careSection(c: Ctx, a: StateCounts): Section {
  const { T, o } = c;
  const blocks: Block[] = [{ kind: 'note', text: T('pdf.care.caveat') }];
  for (const b of branches(o)) {
    const filled = a[`${b}Filled`];
    const partial = a[`${b}Partial`];
    const vacantOnly = a[`${b}VacantOnly`];
    const absent = a[`${b}Absent`];
    const d = a[`${b}Districts`];
    if (d) {
      blocks.push({ kind: 'p', text: T(`pdf.care.districts.${b}`, {
        total: num(o.lang, d.total), vacant: num(o.lang, d.vacant), longTerm: num(o.lang, d.longTerm),
        dissolved: num(o.lang, d.dissolved), rate: pct(o.lang, d.rate) }) });
    }
    blocks.push({ kind: 'p', text: T(`pdf.care.settlements.${b}`, {
      filled: num(o.lang, filled), partial: num(o.lang, partial),
      vacantOnly: num(o.lang, vacantOnly), absent: num(o.lang, absent) }) });
    const parts = [
      { label: T('pdf.state.filled'), value: filled },
      { label: T('pdf.state.partial'), value: partial },
      { label: T('pdf.state.vacantOnly'), value: vacantOnly },
      { label: T('pdf.state.absent'), value: absent },
    ].filter((p) => p.value > 0);
    blocks.push(chart(c, T(`pdf.care.chartTitle.${b}`),
      stackedBar(parts, style(c), (s) => pct(o.lang, s, 0)), T('pdf.care.caption')));
  }
  return { id: 'care', title: T('pdf.section.care'), blocks };
}

interface Minutes {
  medianGpMinutes: number | null; medianDentalMinutes: number | null;
  medianOncallMinutes: number | null; medianInpatientMinutes: number | null;
  withoutDirectBus: number; oncallPoints?: number; ambulanceStations?: number; settlements: number;
}

function accessSection(c: Ctx, a: Minutes): Section {
  const { T, o } = c;
  const unit = T('pdf.unit.min');
  const min = (v: number | null) => (v === null ? '–' : `${num(o.lang, v, 1)} ${unit}`);
  const rows: BarRow[] = [
    { label: T('pdf.access.gp'), value: a.medianGpMinutes },
    { label: T('pdf.access.dental'), value: a.medianDentalMinutes },
    { label: T('pdf.access.oncall'), value: a.medianOncallMinutes },
    { label: T('pdf.access.inpatient'), value: a.medianInpatientMinutes },
  ];
  const facts: [string, string][] = rows.map((r) => [r.label, min(r.value)]);
  facts.push([T('pdf.access.noBus'), `${num(o.lang, a.withoutDirectBus)} / ${num(o.lang, a.settlements)}`]);
  if (a.oncallPoints !== undefined) facts.push([T('pdf.access.oncallPoints'), num(o.lang, a.oncallPoints)]);
  if (a.ambulanceStations !== undefined) facts.push([T('pdf.access.ambulance'), num(o.lang, a.ambulanceStations)]);
  return { id: 'access', title: T('pdf.section.access'), blocks: [
    { kind: 'p', text: T('pdf.access.text') },
    { kind: 'facts', rows: facts },
    chart(c, T('pdf.access.chartTitle'), barChart(rows, style(c), min), T('pdf.access.caption')),
  ] };
}

const STATE_KEY: Record<string, string> = {
  filled: 'filled', partial: 'partial', vacantOnly: 'vacantOnly', absent: 'absent', '': 'absent',
};

function settlementsSection(c: Ctx, rows: SettlementRow[], scope: string): Section {
  const { T, o } = c;
  const sorted = [...rows].sort((a, b) => (BAND_ORDER[a.band] ?? 9) - (BAND_ORDER[b.band] ?? 9)
    || b.population - a.population);
  const shown = o.settlementLimit > 0 ? sorted.slice(0, o.settlementLimit) : sorted;
  const st = (s: State) => T(`pdf.stateShort.${STATE_KEY[s] ?? 'absent'}`);
  const head = [T('pdf.col.settlement'), T('pdf.col.population'), T('pdf.col.band')];
  const bs = branches(o);
  if (bs.includes('gp')) head.push(T('pdf.col.gpState'));
  if (bs.includes('dental')) head.push(T('pdf.col.dentalState'));
  head.push(T('pdf.col.gpMin'), T('pdf.col.oncallMin'));
  const body = shown.map((r) => {
    const cells = [r.name, num(o.lang, r.population), r.band ? T(`pdf.band.${r.band}`) : '–'];
    if (bs.includes('gp')) cells.push(st(r.gp));
    if (bs.includes('dental')) cells.push(st(r.dental));
    cells.push(r.gpMin === null ? '–' : num(o.lang, r.gpMin, 1), r.oncallMin === null ? '–' : num(o.lang, r.oncallMin, 1));
    return cells;
  });
  return { id: 'settlements', title: T('pdf.section.settlements'), blocks: [
    { kind: 'p', text: o.settlementLimit > 0 && rows.length > shown.length
      ? T('pdf.settlements.textTop', { n: shown.length, of: rows.length, scope })
      : T('pdf.settlements.textAll', { of: rows.length, scope }) },
    { kind: 'table', head, rows: body,
      align: head.map((_, i) => (i === 0 || i === 2 || (i >= 3 && i < head.length - 2) ? 'left' : 'right')) },
    { kind: 'note', text: T('pdf.settlements.note') },
  ] };
}

/**
 * The end of every report: when the data are from, set apart so it cannot be
 * missed, then — if the reader asked for them — the method notes and sources.
 * The data month stays even with the notes switched off.
 */
function notesSection(c: Ctx, dataMonth: string, extra: string[] = []): Section {
  const { T, o } = c;
  const when: Block = { kind: 'highlight', text: T('pdf.notes.dataMonth', { month: month(o.lang, dataMonth) }) };
  if (!o.notes) return { id: 'notes', title: T('pdf.section.dataMonth'), blocks: [when] };
  return { id: 'notes', title: T('pdf.section.notes'), blocks: [
    when,
    { kind: 'p', text: T('pdf.notes.data') },
    { kind: 'p', text: T('pdf.notes.vacant') },
    { kind: 'p', text: T('pdf.notes.names') },
    ...extra.map((text) => ({ kind: 'p', text }) as Block),
    { kind: 'p', text: T('pdf.notes.sources') },
    { kind: 'p', text: T('pdf.notes.disclaimer') },
  ] };
}

/** One row per measure: value here, and what to read it against. */
interface MeasureRow { key: string; value: number | null; ref: number | null; refLabel?: string;
  format: (v: number) => string }

function measureTable(c: Ctx, rows: MeasureRow[], refHead: string, rankOf?: (key: string) => string):
  Block {
  const { T } = c;
  const head = [T('pdf.col.measure'), T('pdf.col.value'), refHead];
  if (rankOf) head.push(T('pdf.col.rank'));
  return { kind: 'table', head, align: head.map((_, i) => (i === 0 ? 'left' : 'right')),
    rows: rows.map((r) => {
      const cells = [T(`outcomes.measure.${r.key}`), r.value === null ? '–' : r.format(r.value),
        r.ref === null ? '–' : r.format(r.ref)];
      if (rankOf) cells.push(rankOf(r.key));
      return cells;
    }) };
}

function formats(lang: Lang, T: Translate): Record<string, (v: number) => string> {
  const mft = T('pdf.unit.mFt');
  const min = T('pdf.unit.min');
  return {
    avoidable: (v) => num(lang, v, 0), amenable: (v) => num(lang, v, 0), allCause: (v) => num(lang, v, 0),
    income: (v) => `${num(lang, v / 1000, 2)} ${mft}`,
    jobseekers: (v) => `${num(lang, v, 1)}%`,
    naturalChange: (v) => signed(lang, v, 1, '‰'), migration: (v) => signed(lang, v, 1, '‰'),
    degree: (v) => pct(lang, v), employed: (v) => pct(lang, v), noDigital: (v) => pct(lang, v),
    poorHousing: (v) => pct(lang, v), elderlyOnly: (v) => pct(lang, v),
    sboMinutes: (v) => `${num(lang, v, 1)} ${min}`, sboBeyond30: (v) => pct(lang, v, 0),
    gpLoad: (v) => num(lang, v, 0), ageing: (v) => `${num(lang, v, 0)}%`,
  };
}

/** Lower is better for these; for the rest, higher is. */
const LOWER_BETTER = new Set(['gpRate', 'dentalRate', 'avoidable', 'amenable', 'allCause', 'jobseekers', 'noDigital',
  'poorHousing', 'elderlyOnly', 'sboMinutes', 'sboBeyond30', 'gpLoad', 'ageing']);

function rankText(c: Ctx, key: string, values: (number | null)[], value: number | null, _of?: number,
  form: 'of' | 'short' = 'of'): string {
  if (value === null) return '–';
  const have = values.filter((v): v is number => v !== null);
  // 1 is always the best-placed: the smallest where less is better
  const ahead = LOWER_BETTER.has(key) ? have.filter((v) => v < value).length
    : have.filter((v) => v > value).length;
  return c.T(`pdf.rank.${form}`, { rank: ahead + 1, of: have.length });
}

interface Counts { total: number; vacant: number; dissolved: number; longTerm: number; rate: number | null }

/** The count the rate is made of: on the dental side the dissolved count too. */
const notFilled = (b: Branch, d: Counts) => (b === 'dental' ? d.vacant + d.dissolved : d.vacant);

function districtFacts(c: Ctx, b: Branch, d: Counts | undefined): [string, string][] {
  if (!d) return [];
  const { T, o } = c;
  const rows: [string, string][] = [[T(`pdf.fact.districts.${b}`), num(o.lang, d.total)],
    [T(`pdf.fact.vacantOnly.${b}`), num(o.lang, d.vacant)],
    [T('pdf.fact.longTerm'), num(o.lang, d.longTerm)]];
  if (b === 'dental') rows.push([T('pdf.fact.dissolved'), num(o.lang, d.dissolved)]);
  rows.push([T(`pdf.fact.rate.${b}`), pct(o.lang, d.rate)]);
  return rows;
}

/**
 * The two figures the county page opens with, side by side: how many
 * settlements have no contracted GP, and how many of the area's dental
 * districts are vacant or dissolved.
 */
function headlineCards(c: Ctx, level: 'county' | 'district' | 'kerulet', a: StateCounts & { name: string },
  gpRank: string | null): Block | null {
  const { T, o } = c;
  const pal = PALETTES[o.palette];
  const size = 74;
  const cards: Card[] = [];
  const g = a.gpDistricts;
  if (branches(o).includes('gp') && level === 'kerulet' && g && g.total) {
    // a kerület is one settlement: its share of settlements says nothing, its
    // districts do
    const slices = [
      { value: g.vacant, color: pal.parts[2], text: T('pdf.status.vacant') },
      { value: Math.max(g.total - g.vacant, 0), color: pal.parts[0], text: T('pdf.cards.filledDistricts') },
    ];
    cards.push({ title: T('pdf.fact.state.gp'), size,
      svg: donut(slices, size, pct(o.lang, g.vacant / g.total), c.font),
      value: `${num(o.lang, g.vacant)} / ${num(o.lang, g.total)}`, label: T('pdf.cards.gpKerulet'),
      legend: slices.map((x) => ({ color: x.color, text: `${x.text}: ${num(o.lang, x.value)}` })),
      sub: T('pdf.cards.gpSub', { n: num(o.lang, g.longTerm) }) });
  } else if (branches(o).includes('gp') && a.settlements) {
    const filled = a.settlements - a.gpVacantOnly - a.gpPartial;
    const slices = [
      { value: a.gpVacantOnly, color: pal.parts[2], text: T('pdf.state.vacantOnly') },
      { value: a.gpPartial, color: pal.parts[1], text: T('pdf.state.partial') },
      { value: filled, color: pal.parts[0], text: T('pdf.cards.filledSettlements') },
    ];
    cards.push({ title: T('pdf.fact.state.gp'), size,
      svg: donut(slices, size, pct(o.lang, a.gpVacantOnly / a.settlements), c.font),
      value: `${num(o.lang, a.gpVacantOnly)} / ${num(o.lang, a.settlements)}`,
      label: T('pdf.cards.gp'),
      legend: slices.map((x) => ({ color: x.color, text: `${x.text}: ${num(o.lang, x.value)}` })),
      sub: gpRank ?? undefined });
  }
  const d = a.dentalDistricts;
  if (branches(o).includes('dental') && d && d.total) {
    const filled = Math.max(d.total - d.vacant - d.dissolved, 0);
    const slices = [
      { value: d.vacant, color: pal.parts[2], text: T('pdf.status.vacant') },
      { value: d.dissolved, color: pal.other, text: T('pdf.status.dissolved') },
      { value: filled, color: pal.parts[0], text: T('pdf.cards.filledDistricts') },
    ];
    cards.push({ title: T('pdf.fact.state.dental'), size,
      svg: donut(slices, size, pct(o.lang, notFilled('dental', d) / d.total), c.font),
      value: `${num(o.lang, notFilled('dental', d))} / ${num(o.lang, d.total)}`,
      label: T(`pdf.cards.dental.${level}`),
      legend: slices.map((x) => ({ color: x.color, text: `${x.text}: ${num(o.lang, x.value)}` })),
      sub: T('pdf.cards.dentalSub', { n: num(o.lang, d.longTerm), dissolved: num(o.lang, d.dissolved) }) });
  }
  return cards.length ? { kind: 'cards', cards } : null;
}

/** Hungary with one area lit, as on the page, drawn for the title block. */
function areaOnMap(c: Ctx, features: ShapeFeature[], focus: string, caption: string,
  group?: Set<string>): Report['map'] {
  if (!features.length) return undefined;
  // as wide as fits, but never taller than a fifth of the page
  const ratio = aspect(features);
  const width = Math.min(c.width * 0.62, 340, 165 * ratio);
  const height = width / ratio;
  const shapes = project(features, { x: 2, y: 2, width: width - 4, height: height - 4 });
  return { svg: areaMap(shapes, width, height, focus, PALETTES[c.o.palette], c.font, group),
    width, height, caption };
}

// ---------------------------------------------------------------- county

export interface CountyInput {
  counties: CountiesRaw;
  outcomes: OutcomesRaw | null;
  districts: DistrictsRaw | null;
  name: string;
  /** the twenty county outlines; the map is left out without them */
  geo?: ShapeFeature[] | null;
}

const COUNTY_MEASURES = ['avoidable', 'income', 'jobseekers', 'degree', 'employed',
  'naturalChange', 'migration', 'sboMinutes', 'noDigital', 'elderlyOnly'] as const;

export function countyReport(c: Ctx, input: CountyInput): Report {
  const { T, o } = c;
  const all = input.counties.counties;
  const a = all.find((x) => x.name === input.name);
  if (!a) throw new Error(`no county ${input.name}`);
  const oc = input.outcomes?.counties.find((x) => x.name === input.name) ?? null;
  const sections: Section[] = [];
  const kindLine = T(`pdf.branchLine.${o.branch}`);

  if (want(c, 'summary')) {
    const facts: [string, string][] = [
      [T('pdf.fact.population'), num(o.lang, a.population)],
      [T('pdf.fact.settlements'), num(o.lang, a.settlements)],
    ];
    for (const b of branches(o)) facts.push(...districtFacts(c, b, a[`${b}Districts`]));
    const gpRank = rankText(c, 'gpRate', all.map((x) => x.gpDistricts?.rate ?? null), a.gpDistricts?.rate ?? null, all.length);
    sections.push({ id: 'summary', title: T('pdf.section.summary'), blocks: [
      { kind: 'p', text: T('pdf.summary.county', { name: a.name, population: num(o.lang, a.population),
        settlements: num(o.lang, a.settlements) }) },
      ...branches(o).filter((b) => a[`${b}Districts`]).map((b) => ({ kind: 'p', text: T(`pdf.summary.vacancy.${b}`, {
        vacant: num(o.lang, notFilled(b, a[`${b}Districts`]!)), total: num(o.lang, a[`${b}Districts`]!.total),
        rate: pct(o.lang, a[`${b}Districts`]!.rate),
        rank: b === 'gp' ? gpRank : rankText(c, 'dentalRate', all.map((x) => x.dentalDistricts?.rate ?? null),
          a.dentalDistricts?.rate ?? null, all.length),
        scope: T('pdf.scope.counties') }) }) as Block),
      ...[headlineCards(c, 'county', a, T('pdf.cards.rank', { rank: rankText(c, 'gpRate',
        all.map((x) => (x.settlements ? x.gpVacantOnly / x.settlements : null)),
        a.settlements ? a.gpVacantOnly / a.settlements : null) }))].filter((b): b is Block => b !== null),
      { kind: 'facts', rows: facts },
    ] });
  }

  if (want(c, 'age')) {
    const nat = sumAge(all.map((x) => x.age));
    const s = ageSection(c, a.name, a.age, nat);
    if (s) sections.push(s);
  }
  if (want(c, 'care')) sections.push(careSection(c, a));

  if (want(c, 'churn')) {
    const blocks: Block[] = [{ kind: 'note', text: T('pdf.churn.caveat') }];
    for (const b of branches(o)) {
      const ch = a[`${b}Churn`];
      if (!ch) continue;
      blocks.push({ kind: 'p', text: T(`pdf.churn.text.${b}`, {
        changes: num(o.lang, ch.recentChanges), districts: num(o.lang, ch.districts),
        rate: ch.recentRate === null ? '–' : num(o.lang, ch.recentRate, 1),
        years: ch.medianTenureMonths === null ? '–' : num(o.lang, ch.medianTenureMonths / 12, 1),
        unchanged: num(o.lang, ch.unchangedWholeWindow) }) });
      const rows = [...all].map((x) => ({ label: x.name, value: x[`${b}Churn`]?.recentRate ?? null,
        focus: x.name === a.name })).sort((p, q) => (q.value ?? -1) - (p.value ?? -1));
      blocks.push(chart(c, T(`pdf.churn.chartTitle.${b}`),
        barChart(rows, style(c), (v) => num(o.lang, v, 1)), T('pdf.churn.caption')));
    }
    sections.push({ id: 'churn', title: T('pdf.section.churn'), blocks });
  }

  if (want(c, 'access')) sections.push(accessSection(c, a));

  if (want(c, 'ranking')) {
    const blocks: Block[] = [{ kind: 'p', text: T('pdf.ranking.countyText') }];
    for (const b of branches(o)) {
      const rows = all.map((x) => ({ label: x.name, value: x[`${b}Districts`]?.rate ?? null,
        focus: x.name === a.name })).sort((p, q) => (q.value ?? -1) - (p.value ?? -1));
      blocks.push(chart(c, T(`pdf.ranking.chartTitle.${b}`),
        barChart(rows, style(c), (v) => pct(o.lang, v)), T('pdf.ranking.caption')));
    }
    sections.push({ id: 'ranking', title: T('pdf.section.ranking'), blocks });
  }

  if (want(c, 'outcomes') && input.outcomes && oc) {
    const f = formats(o.lang, T);
    const cs = input.outcomes.counties;
    const rows: MeasureRow[] = COUNTY_MEASURES.map((key) => ({ key,
      value: (oc[key as keyof OutcomeCounty] as number | null) ?? null,
      ref: median(cs.map((x) => x[key as keyof OutcomeCounty] as number | null)), format: f[key] }));
    const src = input.outcomes.sources;
    const blocks: Block[] = [
      { kind: 'p', text: T('pdf.outcomes.countyText', { year: src.mortality.year,
        incomeYear: src.territorial.incomeYear }) },
      measureTable(c, rows, T('pdf.col.countyMedian'), (key) => rankText(c, key,
        cs.map((x) => x[key as keyof OutcomeCounty] as number | null),
        (oc[key as keyof OutcomeCounty] as number | null) ?? null, cs.length, 'short')),
      { kind: 'note', text: T('pdf.outcomes.rankNote') },
    ];
    const av = cs.map((x) => ({ label: x.name, value: x.avoidable, focus: x.name === a.name }))
      .sort((p, q) => (q.value ?? -1) - (p.value ?? -1));
    blocks.push(chart(c, T('pdf.outcomes.avoidableTitle', { year: src.mortality.year }),
      barChart(av, style(c), f.avoidable), T('pdf.outcomes.avoidableCaption')));
    const js = input.outcomes.series.jobseekers;
    const own = js.counties[a.name];
    if (own) {
      blocks.push(chart(c, T('pdf.outcomes.jobseekersTitle'), lineChart([
        { label: a.name, values: own, focus: true },
        { label: T('pdf.ref.national'), values: js.national },
      ], js.months.map((m) => month(o.lang, m)), style(c), (v) => `${num(o.lang, v, 1)}%`),
      T('pdf.outcomes.jobseekersCaption')));
    }
    blocks.push({ kind: 'note', text: T('pdf.outcomes.association') });
    sections.push({ id: 'outcomes', title: T('pdf.section.outcomes'), blocks });
  }

  if (want(c, 'forecast') && oc && oc.gpRateIn12 !== null) {
    const blocks: Block[] = [];
    if (branches(o).includes('gp')) {
      blocks.push({ kind: 'p', text: T('pdf.forecast.county.gp', {
        now: pct(o.lang, oc.gpRateNow), later: pct(o.lang, oc.gpRateIn12) }) });
    }
    if (branches(o).includes('dental') && oc.dentalRateIn12 !== null) {
      blocks.push({ kind: 'p', text: T('pdf.forecast.county.dental', {
        now: pct(o.lang, a.dentalDistricts?.rate ?? null), later: pct(o.lang, oc.dentalRateIn12) }) });
    }
    blocks.push({ kind: 'note', text: T('pdf.forecast.method') });
    sections.push({ id: 'forecast', title: T('pdf.section.forecast'), blocks });
  }

  if (want(c, 'districts') && input.districts) {
    const ds = input.districts.districts.filter((d) => d.county === a.name);
    const head = [T('pdf.col.district'), T('pdf.col.population')];
    if (branches(o).includes('gp')) head.push(T('pdf.col.gpVacant'), T('pdf.col.gpRate'));
    if (branches(o).includes('dental')) head.push(T('pdf.col.dentalRate'));
    head.push(T('pdf.col.gpMin'));
    const rows = [...ds].sort((p, q) => (q.gpDistricts?.rate ?? -1) - (p.gpDistricts?.rate ?? -1)).map((d) => {
      const cells = [d.name, num(o.lang, d.population)];
      if (branches(o).includes('gp')) {
        cells.push(d.gpDistricts ? `${num(o.lang, d.gpDistricts.vacant)} / ${num(o.lang, d.gpDistricts.total)}` : '–',
          pct(o.lang, d.gpDistricts?.rate ?? null));
      }
      if (branches(o).includes('dental')) cells.push(pct(o.lang, d.dentalDistricts?.rate ?? null));
      cells.push(d.medianGpMinutes === null ? '–' : num(o.lang, d.medianGpMinutes, 1));
      return cells;
    });
    sections.push({ id: 'districts', title: T('pdf.section.districts'), blocks: [
      { kind: 'p', text: T('pdf.districts.text', { n: ds.length }) },
      { kind: 'table', head, rows, align: head.map((_, i) => (i === 0 ? 'left' : 'right')) },
    ] });
  }

  if (want(c, 'settlements')) {
    sections.push(settlementsSection(c, decodeRows(input.counties.fields,
      input.counties.settlements[a.name]), a.name));
  }
  sections.push(notesSection(c, input.counties.dataMonth));

  return {
    title: a.name,
    subtitle: `${T('pdf.kind.county')} · ${kindLine}`,
    map: input.geo ? areaOnMap(c, input.geo, a.name, T('pdf.map.county', { name: a.name })) : undefined,
    sections, fileSlug: `${T('pdf.file.county')}-${slugify(a.name)}`,
  };
}

function sumAge(list: (AgeSplit | undefined)[]): AgeSplit | null {
  const have = list.filter((x): x is AgeSplit => !!x && !!x.total);
  if (!have.length) return null;
  return have.reduce((s, x) => ({ young: s.young + x.young, working: s.working + x.working,
    old: s.old + x.old, total: s.total + x.total }), { young: 0, working: 0, old: 0, total: 0 });
}

// ---------------------------------------------------------------- district

export interface DistrictInput {
  districts: DistrictsRaw;
  outcomes: OutcomesRaw | null;
  name: string;
  /** the járás outlines and the capital's kerület; no map without them */
  geo?: { jaras: ShapeFeature[]; capital: ShapeFeature[] } | null;
}

const DISTRICT_MEASURES = ['avoidable', 'income', 'jobseekers', 'degree', 'employed',
  'naturalChange', 'migration', 'gpLoad', 'ageing', 'sboMinutes', 'noDigital', 'elderlyOnly'] as const;

export function districtReport(c: Ctx, input: DistrictInput): Report {
  const { T, o } = c;
  const all = input.districts.districts;
  const d = all.find((x) => x.name === input.name);
  if (!d) throw new Error(`no district ${input.name}`);
  const od = input.outcomes?.districts.find((x) => x.name === input.name) ?? null;
  const sameCounty = all.filter((x) => x.county === d.county);
  const peers = all.filter((x) => x.isCapital === d.isCapital);
  const scope = T(d.isCapital ? 'pdf.scope.kerulet' : 'pdf.scope.jaras');
  const sections: Section[] = [];

  if (want(c, 'summary')) {
    const facts: [string, string][] = [
      [T('pdf.fact.county'), d.county], [T('pdf.fact.seat'), d.seat],
      [T('pdf.fact.population'), num(o.lang, d.population)],
      [T('pdf.fact.settlements'), num(o.lang, d.settlements)],
    ];
    if (d.area) facts.push([T('pdf.fact.area'), `${num(o.lang, d.area / 100, 0)} km²`]);
    for (const b of branches(o)) facts.push(...districtFacts(c, b, d[`${b}Districts`]));
    facts.push([T('pdf.fact.pharmacies'), num(o.lang, d.pharmacies)]);
    sections.push({ id: 'summary', title: T('pdf.section.summary'), blocks: [
      { kind: 'p', text: T('pdf.summary.district', { name: d.name, county: d.county, seat: d.seat,
        population: num(o.lang, d.population), settlements: num(o.lang, d.settlements) }) },
      ...branches(o).filter((b) => d[`${b}Districts`]).map((b) => ({ kind: 'p', text: T(`pdf.summary.vacancy.${b}`, {
        vacant: num(o.lang, notFilled(b, d[`${b}Districts`]!)), total: num(o.lang, d[`${b}Districts`]!.total),
        rate: pct(o.lang, d[`${b}Districts`]!.rate),
        rank: rankText(c, b === 'gp' ? 'gpRate' : 'dentalRate', peers.map((x) => x[`${b}Districts`]?.rate ?? null),
          d[`${b}Districts`]?.rate ?? null, peers.length),
        scope }) }) as Block),
      ...[headlineCards(c, d.isCapital ? 'kerulet' : 'district', d, d.isCapital ? null : T('pdf.cards.rank', { rank: rankText(c, 'gpRate',
        peers.map((x) => (x.settlements ? x.gpVacantOnly / x.settlements : null)),
        d.settlements ? d.gpVacantOnly / d.settlements : null) }))].filter((b): b is Block => b !== null),
      { kind: 'facts', rows: facts },
    ] });
  }

  if (want(c, 'age')) {
    const s = ageSection(c, d.name, d.age, sumAge(all.map((x) => x.age)));
    if (s) sections.push(s);
  }
  if (want(c, 'care')) sections.push(careSection(c, d));
  if (want(c, 'access')) sections.push(accessSection(c, d));

  if (want(c, 'development') && d.development) {
    const dev = d.development;
    const blocks: Block[] = [{ kind: 'p', text: T('pdf.development.text', {
      complex: num(o.lang, dev.complex, 2),
      rank: dev.rank === null ? '–' : num(o.lang, dev.rank),
      of: num(o.lang, all.filter((x) => x.development?.rank).length),
      beneficiary: T(dev.beneficiary ? 'pdf.development.beneficiary' : 'pdf.development.notBeneficiary') }) }];
    if (d.lagging) {
      blocks.push({ kind: 'p', text: T('pdf.development.lagging', {
        n: num(o.lang, d.lagging.settlements), of: num(o.lang, d.settlements),
        population: num(o.lang, d.lagging.population),
        share: pct(o.lang, d.lagging.populationShare) }) });
    }
    const rows = sameCounty.filter((x) => x.development).map((x) => ({ label: x.name,
      value: x.development!.complex, focus: x.name === d.name }))
      .sort((p, q) => (p.value ?? 0) - (q.value ?? 0));
    blocks.push(chart(c, T('pdf.development.chartTitle', { county: d.county }),
      barChart(rows, style(c), (v) => num(o.lang, v, 1)), T('pdf.development.caption')));
    sections.push({ id: 'development', title: T('pdf.section.development'), blocks });
  }

  if (want(c, 'ranking')) {
    const blocks: Block[] = [{ kind: 'p', text: T('pdf.ranking.districtText', { county: d.county }) }];
    for (const b of branches(o)) {
      const rows = sameCounty.map((x) => ({ label: x.name, value: x[`${b}Districts`]?.rate ?? null,
        focus: x.name === d.name })).sort((p, q) => (q.value ?? -1) - (p.value ?? -1));
      blocks.push(chart(c, T(`pdf.ranking.districtChart.${b}`, { county: d.county }),
        barChart(rows, style(c), (v) => pct(o.lang, v)), T('pdf.ranking.caption')));
    }
    sections.push({ id: 'ranking', title: T('pdf.section.ranking'), blocks });
  }

  if (want(c, 'outcomes') && input.outcomes && od) {
    const f = formats(o.lang, T);
    const rural = input.outcomes.districts.filter((x) => !x.capital);
    const cty = input.outcomes.counties.find((x) => x.name === d.county) ?? null;
    const rows: MeasureRow[] = DISTRICT_MEASURES.map((key) => ({ key,
      value: (od[key as keyof OutcomeDistrict] as number | null) ?? null,
      ref: median(rural.map((x) => x[key as keyof OutcomeDistrict] as number | null)), format: f[key] }));
    const src = input.outcomes.sources;
    const blocks: Block[] = [
      { kind: 'p', text: T('pdf.outcomes.districtText', { year: src.mortality.year,
        incomeYear: src.territorial.incomeYear }) },
    ];
    if (od.capitalWide) blocks.push({ kind: 'note', text: T('pdf.outcomes.capitalWide') });
    blocks.push(measureTable(c, rows, T('pdf.col.ruralMedian'), (key) => (od.capital ? '–' : rankText(c, key,
      rural.map((x) => x[key as keyof OutcomeDistrict] as number | null),
      (od[key as keyof OutcomeDistrict] as number | null) ?? null, rural.length, 'short'))),
    { kind: 'note', text: T('pdf.outcomes.rankNoteDistrict') });
    const inCounty = input.outcomes.districts.filter((x) => x.county === d.county)
      .map((x) => ({ label: x.name, value: x.avoidable, focus: x.name === d.name }))
      .sort((p, q) => (q.value ?? -1) - (p.value ?? -1));
    if (inCounty.some((r) => r.value !== null)) {
      blocks.push(chart(c, T('pdf.outcomes.avoidableDistrictTitle', { county: d.county, year: src.mortality.year }),
        barChart(inCounty, style(c), f.avoidable), T('pdf.outcomes.avoidableCaption')));
    }
    if (cty) {
      blocks.push({ kind: 'p', text: T('pdf.outcomes.countyRef', { county: d.county,
        avoidable: cty.avoidable === null ? '–' : f.avoidable(cty.avoidable),
        jobseekers: cty.jobseekers === null ? '–' : f.jobseekers(cty.jobseekers) }) });
    }
    blocks.push({ kind: 'note', text: T('pdf.outcomes.association') });
    sections.push({ id: 'outcomes', title: T('pdf.section.outcomes'), blocks });
  }

  if (want(c, 'forecast') && od && od.gpRateIn12 !== null && branches(o).includes('gp')) {
    sections.push({ id: 'forecast', title: T('pdf.section.forecast'), blocks: [
      { kind: 'p', text: T('pdf.forecast.district', {
        now: pct(o.lang, od.gpRate), later: pct(o.lang, od.gpRateIn12),
        vacant: num(o.lang, od.gpVacantIn12, 1), fresh: num(o.lang, od.gpExpectedNew, 1) }) },
      { kind: 'note', text: T('pdf.forecast.method') },
    ] });
  }

  if (want(c, 'settlements')) {
    sections.push(settlementsSection(c, decodeRows(input.districts.fields,
      input.districts.settlements[d.name]), d.name));
  }
  sections.push(notesSection(c, input.districts.dataMonth));

  return {
    title: T(d.isCapital ? 'pdf.title.kerulet' : 'pdf.title.jaras', { name: d.name }),
    subtitle: `${T('pdf.kind.district')} · ${d.county} · ${T(`pdf.branchLine.${o.branch}`)}`,
    // a kerület is drawn on the capital's own map: on the country's it is a dot
    map: input.geo ? (d.isCapital
      ? areaOnMap(c, input.geo.capital, d.name, T('pdf.map.kerulet', { name: d.name }))
      : areaOnMap(c, input.geo.jaras, d.name, T('pdf.map.district', { name: d.name, county: d.county }),
        new Set(sameCounty.map((x) => x.name)))) : undefined,
    sections, fileSlug: `${T('pdf.file.district')}-${slugify(d.name)}`,
  };
}

// ---------------------------------------------------------------- settlement

interface Trip { minutes: number; km: number; at: string }
interface Surgery {
  kind: Branch; fin: string; type: string; doctor?: string; provider?: string;
  postalCode?: string; address?: string; since?: string; months?: number; fromStart?: boolean;
}
interface Vacancy {
  kind: Branch; fin: string; type: string; status: string; since: string;
  longTerm?: boolean; seat?: string; population?: number;
}
interface Compared { value: number | null; district?: number | null; county?: number | null;
  median?: number | null; country?: number | null; national?: number | null; year?: string }

export interface SettlementProfile {
  slug: string; settlement: string; county: string; district: string;
  population: number; area?: number; benefit?: boolean;
  gp?: { state: string; filled: number; vacant: number; isSeat: boolean };
  dental?: { state: string; filled: number; vacant: number; isSeat: boolean };
  travel?: Record<string, Trip | null>;
  transit?: { departures: number; reachable: number;
    gp?: { direct: boolean; minutes: number; target: string } | null;
    oncall?: { direct: boolean; minutes: number; target: string } | null;
    inpatient?: { direct: boolean; minutes: number; target: string } | null };
  age?: { young: number; old: number; censusYoung?: number; censusWorking?: number;
    censusOld?: number; censusTotal?: number };
  index?: { value: number; band: string; rank: number; of: number; parts: Record<string, number> };
  vacant?: Vacancy[];
  change?: { month: string; kinds: Record<Branch, { vacant: number; vacantNow: number;
    resolved: unknown[]; newlyVacant: unknown[] }>; newDoctors: number;
    arrivals: { kind: Branch; type: string; doctor?: string; since: string }[] };
  surgeries?: Surgery[];
  pharmacies?: { name: string; postalCode?: string; address?: string }[];
  living?: {
    income?: Compared; naturalChange?: Compared; migration?: Compared;
    jobseekers?: Compared & { month?: string; months?: string[]; series?: (number | null)[];
      registered?: number };
    census?: Record<string, Compared>;
  };
}

export interface SettlementInput {
  profile: SettlementProfile;
  dataMonth: string;
  /** the country's age split and jobseeker series, for reference */
  national?: { age?: AgeSplit; jobseekers?: { months: string[]; series: (number | null)[] } };
}

const TRAVEL_KEYS = ['gp', 'dental', 'pharmacy', 'outpatient', 'gyse', 'oncall', 'ambulance',
  'inpatient', 'sbo'] as const;
const INDEX_PARTS = ['vacancy', 'gpMin', 'dentalMin', 'oncallMin', 'outpatientMin', 'inpatientMin',
  'transit', 'ageing', 'risk', 'deprivation'] as const;

export function settlementReport(c: Ctx, input: SettlementInput): Report {
  const { T, o } = c;
  const p = input.profile;
  const sections: Section[] = [];
  const min = (v: number | null | undefined) => (v === null || v === undefined ? '–'
    : `${num(o.lang, v, 1)} ${T('pdf.unit.min')}`);

  if (want(c, 'summary')) {
    const facts: [string, string][] = [
      [T('pdf.fact.county'), p.county], [T('pdf.fact.district'), p.district],
      [T('pdf.fact.population'), num(o.lang, p.population)],
    ];
    if (p.area) facts.push([T('pdf.fact.area'), `${num(o.lang, p.area / 100, 1)} km²`]);
    if (p.benefit) facts.push([T('pdf.fact.benefit'), T('pdf.yes')]);
    for (const b of branches(o)) {
      const x = p[b];
      if (!x) continue;
      facts.push([T(`pdf.fact.state.${b}`), T(`pdf.settlementState.${x.state || 'absent'}`)],
        [T(`pdf.fact.counts.${b}`), T('pdf.fact.countsValue', { filled: num(o.lang, x.filled),
          vacant: num(o.lang, x.vacant) })]);
    }
    if (p.index) facts.push([T('pdf.fact.index'), `${num(o.lang, p.index.value, 1)} (${T(`pdf.band.${p.index.band}`)})`]);
    sections.push({ id: 'summary', title: T('pdf.section.summary'), blocks: [
      { kind: 'p', text: T('pdf.summary.settlement', { name: p.settlement, county: p.county,
        district: p.district, population: num(o.lang, p.population) }) },
      { kind: 'facts', rows: facts },
    ] });
  }

  if (want(c, 'care')) {
    const blocks: Block[] = [{ kind: 'note', text: T('pdf.care.caveat') }];
    const surgeries = (p.surgeries ?? []).filter((s) => branches(o).includes(s.kind));
    if (surgeries.length) {
      blocks.push({ kind: 'p', text: T('pdf.care.surgeriesText', { n: surgeries.length }) });
      blocks.push({ kind: 'table',
        head: [T('pdf.col.branch'), T('pdf.col.type'), T('pdf.col.doctor'), T('pdf.col.address'), T('pdf.col.since')],
        rows: surgeries.map((s) => [T(`pdf.branch.${s.kind}`), T(`pdf.type.${s.type}`), s.doctor ?? '–',
          [s.postalCode, s.address].filter(Boolean).join(' ') || '–',
          s.fromStart ? T('pdf.care.fromStart', { month: month(o.lang, s.since) }) : month(o.lang, s.since)]),
        widths: ['auto', 'auto', '*', '*', 'auto'] });
    } else {
      blocks.push({ kind: 'p', text: T('pdf.care.noSurgery') });
    }
    const vacant = (p.vacant ?? []).filter((v) => branches(o).includes(v.kind));
    if (vacant.length) {
      blocks.push({ kind: 'p', text: T('pdf.care.vacantText', { n: vacant.length }) });
      blocks.push({ kind: 'table',
        head: [T('pdf.col.branch'), T('pdf.col.type'), T('pdf.col.status'), T('pdf.col.vacantSince'), T('pdf.col.seat'), T('pdf.col.served')],
        rows: vacant.map((v) => [T(`pdf.branch.${v.kind}`), T(`pdf.type.${v.type}`),
          T(v.status === 'dissolved' ? 'pdf.status.dissolved' : v.longTerm ? 'pdf.status.longTerm' : 'pdf.status.vacant'),
          month(o.lang, v.since), v.seat ?? '–', v.population ? num(o.lang, v.population) : '–']),
        align: ['left', 'left', 'left', 'left', 'left', 'right'] });
    }
    sections.push({ id: 'care', title: T('pdf.section.care'), blocks });
  }

  if (want(c, 'access') && p.travel) {
    const rows = TRAVEL_KEYS.filter((k) => p.travel?.[k]).map((k) => {
      const tr = p.travel![k]!;
      return { key: k, label: T(`pdf.travel.${k}`), value: tr.minutes, at: tr.at, km: tr.km };
    });
    sections.push({ id: 'access', title: T('pdf.section.access'), blocks: [
      { kind: 'p', text: T('pdf.access.settlementText') },
      { kind: 'table', head: [T('pdf.col.service'), T('pdf.col.nearestAt'), T('pdf.col.minutes'), T('pdf.col.km')],
        rows: rows.map((r) => [r.label, r.at, min(r.value), num(o.lang, r.km, 1)]),
        align: ['left', 'left', 'right', 'right'] },
      chart(c, T('pdf.access.settlementChart'), barChart(rows.map((r) => ({ label: r.label, value: r.value,
        focus: r.key === 'gp' || r.key === 'dental' })), style(c), (v) => min(v)), T('pdf.access.settlementCaption')),
    ] });
  }

  if (want(c, 'transit') && p.transit) {
    const tr = p.transit;
    const line = (key: 'gp' | 'oncall' | 'inpatient') => {
      const x = tr[key];
      if (!x) return T('pdf.transit.none');
      return x.minutes === 0 ? T('pdf.transit.here', { target: x.target })
        : T(x.direct ? 'pdf.transit.direct' : 'pdf.transit.change', { target: x.target, minutes: num(o.lang, x.minutes) });
    };
    sections.push({ id: 'transit', title: T('pdf.section.transit'), blocks: [
      { kind: 'p', text: T('pdf.transit.text', { departures: num(o.lang, tr.departures),
        reachable: num(o.lang, tr.reachable) }) },
      { kind: 'facts', rows: [[T('pdf.transit.gp'), line('gp')], [T('pdf.transit.oncall'), line('oncall')],
        [T('pdf.transit.inpatient'), line('inpatient')]] },
      { kind: 'note', text: T('pdf.transit.note') },
    ] });
  }

  if (want(c, 'age') && p.age?.censusTotal) {
    const s = ageSection(c, p.settlement, { young: p.age.censusYoung ?? 0, working: p.age.censusWorking ?? 0,
      old: p.age.censusOld ?? 0, total: p.age.censusTotal }, input.national?.age ?? null);
    if (s) sections.push(s);
  }

  if (want(c, 'index') && p.index) {
    const ix = p.index;
    sections.push({ id: 'index', title: T('pdf.section.index'), blocks: [
      { kind: 'p', text: T('pdf.index.text', { value: num(o.lang, ix.value, 1), band: T(`pdf.band.${ix.band}`),
        rank: num(o.lang, ix.rank), of: num(o.lang, ix.of) }) },
      chart(c, T('pdf.index.chartTitle'), barChart(INDEX_PARTS.filter((k) => ix.parts[k] !== undefined)
        .map((k) => ({ label: T(`pdf.indexPart.${k}`), value: ix.parts[k] * 100,
          focus: ix.parts[k] >= 0.75 })), style(c), (v) => num(o.lang, v, 0)), T('pdf.index.caption')),
      { kind: 'note', text: T('pdf.index.note') },
    ] });
  }

  if (want(c, 'living') && p.living) {
    const lv = p.living;
    const f = formats(o.lang, T);
    const rows: string[][] = [];
    const add = (key: string, x: Compared | undefined, fmt: (v: number) => string, refs: ('district' | 'county' | 'median' | 'country')[]) => {
      if (!x) return;
      const cell = (v: number | null | undefined) => (v === null || v === undefined ? '–' : fmt(v));
      rows.push([T(`outcomes.measure.${key}`), cell(x.value), ...refs.map((r) => cell(x[r]))]);
    };
    add('income', lv.income, f.income, ['district', 'county', 'median']);
    add('naturalChange', lv.naturalChange, f.naturalChange, ['district', 'county', 'median']);
    add('migration', lv.migration, f.migration, ['district', 'county', 'median']);
    if (lv.jobseekers) {
      const j = lv.jobseekers;
      rows.push([T('outcomes.measure.jobseekers'), j.value === null ? '–' : f.jobseekers(j.value),
        j.district == null ? '–' : f.jobseekers(j.district), j.county == null ? '–' : f.jobseekers(j.county),
        j.national == null ? '–' : f.jobseekers(j.national)]);
    }
    for (const key of ['degree', 'employed', 'noDigital', 'poorHousing', 'elderlyOnly']) {
      add(key, lv.census?.[key], f[key], ['district', 'county', 'country']);
    }
    const blocks: Block[] = [
      { kind: 'p', text: T('pdf.living.text', { incomeYear: lv.income?.year ?? '–' }) },
      { kind: 'table', head: [T('pdf.col.measure'), p.settlement, T('pdf.col.district'), T('pdf.col.county'),
        T('pdf.col.countryOrMedian')], rows, align: ['left', 'right', 'right', 'right', 'right'] },
      { kind: 'note', text: T('pdf.living.note') },
    ];
    if (lv.income?.value != null) {
      blocks.push(chart(c, T('pdf.living.incomeChart', { year: lv.income.year ?? '' }), barChart([
        { label: p.settlement, value: lv.income.value, focus: true },
        { label: T('pdf.ref.district'), value: lv.income.district ?? null },
        { label: T('pdf.ref.county'), value: lv.income.county ?? null },
        { label: T('pdf.ref.median'), value: lv.income.median ?? null },
      ], style(c), f.income), T('pdf.living.incomeCaption')));
    }
    sections.push({ id: 'living', title: T('pdf.section.living'), blocks });
  }

  if (want(c, 'jobseekers') && p.living?.jobseekers?.series?.length) {
    const j = p.living.jobseekers;
    const months = j.months ?? [];
    const nat = input.national?.jobseekers;
    const lines = [{ label: p.settlement, values: j.series!, focus: true }];
    if (nat && nat.months.length === months.length) lines.push({ label: T('pdf.ref.national'), values: nat.series, focus: false });
    sections.push({ id: 'jobseekers', title: T('pdf.section.jobseekers'), blocks: [
      { kind: 'p', text: T('pdf.jobseekers.text', { value: j.value === null ? '–' : `${num(o.lang, j.value, 1)}%`,
        month: month(o.lang, j.month), registered: num(o.lang, j.registered ?? null) }) },
      chart(c, T('pdf.jobseekers.chartTitle'), lineChart(lines, months.map((m) => month(o.lang, m)),
        style(c), (v) => `${num(o.lang, v, 1)}%`), T('pdf.jobseekers.caption')),
    ] });
  }

  if (want(c, 'change') && p.change) {
    const ch = p.change;
    const blocks: Block[] = [];
    for (const b of branches(o)) {
      const k = ch.kinds[b];
      if (!k) continue;
      blocks.push({ kind: 'p', text: T(`pdf.change.${b}`, { month: month(o.lang, ch.month),
        before: num(o.lang, k.vacant), now: num(o.lang, k.vacantNow),
        resolved: num(o.lang, k.resolved.length), fresh: num(o.lang, k.newlyVacant.length) }) });
    }
    const arrivals = ch.arrivals.filter((x) => branches(o).includes(x.kind));
    if (arrivals.length) {
      blocks.push({ kind: 'table', head: [T('pdf.col.branch'), T('pdf.col.type'), T('pdf.col.doctor'), T('pdf.col.since')],
        rows: arrivals.map((x) => [T(`pdf.branch.${x.kind}`), T(`pdf.type.${x.type}`), x.doctor ?? '–', month(o.lang, x.since)]) });
    } else {
      blocks.push({ kind: 'p', text: T('pdf.change.noArrivals', { month: month(o.lang, ch.month) }) });
    }
    sections.push({ id: 'change', title: T('pdf.section.change'), blocks });
  }

  if (want(c, 'pharmacies')) {
    const ph = p.pharmacies ?? [];
    sections.push({ id: 'pharmacies', title: T('pdf.section.pharmacies'), blocks: ph.length ? [
      { kind: 'p', text: T('pdf.pharmacies.text', { n: ph.length }) },
      { kind: 'table', head: [T('pdf.col.name'), T('pdf.col.address')],
        rows: ph.map((x) => [x.name, [x.postalCode, x.address].filter(Boolean).join(' ') || '–']) },
    ] : [{ kind: 'p', text: T('pdf.pharmacies.none', {
      at: p.travel?.pharmacy?.at ?? '–', minutes: min(p.travel?.pharmacy?.minutes) }) }] });
  }

  sections.push(notesSection(c, input.dataMonth, [T('pdf.notes.settlement')]));

  return {
    title: p.settlement,
    // a kerület is named in full already; a járás takes the word after it
    subtitle: `${T('pdf.kind.settlement')} · ${p.district.startsWith('Budapest')
      ? p.district : T('pdf.title.jaras', { name: p.district })} · ${p.county}`,
    sections, fileSlug: `${T('pdf.file.settlement')}-${p.slug}`,
  };
}

export type { CountyAggregateRow, DistrictRow };
