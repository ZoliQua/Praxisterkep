// "Mi változott?" as a PDF: one stretch of the current year, month pair by
// month pair, for both branches.
//
// The reader picks a first and a last archived month; every monthly pair of
// changes.json that falls inside is taken, and the district codes are
// followed through them. A code's first and last move decide what it did
// over the whole stretch: fell vacant and stayed so, left the list and stayed
// off, or did either and came back by the end (a move the two end months
// alone would not show). Start − left + new = end, or the report refuses to
// build — the same identity changes.py guards for each pair.
//
// The wider view comes from timeseries.json (the same vacancy count, every
// archived month since 2019) and from the year-end months of changes.json.
// Every number is read from those two files; sentences are templates.
import type { ChangeEntry, ChangePair, ChangesRaw } from '../lib/changes';
import { barChart, lineChart, PALETTES, type ChartStyle } from './charts';
import { endNotes } from './analysisReport';
import { month, num, pct, signed } from './format';
import type { Ctx } from './report';
import type { Block, Report, Section } from './types';

type Branch = 'gp' | 'dental';

interface TimePoint { month: string; totalDistricts: number; vacant: number; populationVacant: number }

export interface ChangesInput {
  changes: ChangesRaw;
  timeseries: Record<Branch, TimePoint[]>;
}

/** A district's moves inside the stretch, the month each happened in. */
export interface PeriodEntry extends ChangeEntry { month: string }

export interface Period {
  from: string; to: string; months: number; pairs: ChangePair[];
  vacantFrom: number; vacantTo: number;
  populationFrom: number | null; populationTo: number | null;
  totalFrom: number | null; totalTo: number | null;
  longTermFrom: number | null; longTermTo: number | null;
  /** monthly moves, summed: a district that moved twice counts twice */
  moves: { ended: number; added: number };
  /** vacant at the end, not at the start; origin from its first move */
  added: PeriodEntry[];
  /** vacant at the start, not at the end; fate from its last move */
  ended: PeriodEntry[];
  /** fell vacant and was off the list again by the end */
  passing: { first: PeriodEntry; last: PeriodEntry }[];
  /** left the list and was back on it by the end */
  returned: { first: PeriodEntry; last: PeriodEntry }[];
  counties: { county: string; vacantFrom: number; vacantTo: number; added: number; ended: number }[];
  doctorChanges: number | null;
  byType: Record<string, [number, number]>;
}

const monthsBetween = (a: string, b: string) =>
  (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7));

/** Every month a stretch can start or end on: the ends of the monthly pairs, both branches. */
export function periodMonths(raw: ChangesRaw): string[] {
  const all = new Set<string>();
  for (const k of Object.values(raw.kinds)) {
    for (const p of k.monthly) { all.add(p.from); all.add(p.to); }
  }
  return [...all].sort();
}

/** The pairs of one branch inside [from, to], followed code by code; null when none fits. */
export function periodOf(pairs: ChangePair[], from: string, to: string): Period | null {
  const inside = pairs.filter((p) => p.from >= from && p.to <= to);
  if (!inside.length) return null;
  const first = inside[0];
  const last = inside[inside.length - 1];
  for (let i = 1; i < inside.length; i += 1) {
    if (inside[i].from !== inside[i - 1].to) throw new Error(`changes: ${inside[i - 1].to} and ${inside[i].from} do not meet`);
  }

  // every move of every code, in order
  const moves = new Map<string, { dir: 'in' | 'out'; e: PeriodEntry }[]>();
  for (const p of inside) {
    if (!p.newList || !p.endedList) throw new Error(`changes: ${p.from} -> ${p.to} carries no lists`);
    for (const [dir, list] of [['in', p.newList], ['out', p.endedList]] as const) {
      for (const e of list) {
        const seq = moves.get(e.id) ?? [];
        seq.push({ dir, e: { ...e, month: p.to } });
        moves.set(e.id, seq);
      }
    }
  }
  const added: PeriodEntry[] = [];
  const ended: PeriodEntry[] = [];
  const passing: Period['passing'] = [];
  const returned: Period['returned'] = [];
  for (const seq of moves.values()) {
    const a = seq[0];
    const z = seq[seq.length - 1];
    if (a.dir === 'in' && z.dir === 'in') added.push({ ...a.e, month: z.e.month });
    else if (a.dir === 'out' && z.dir === 'out') ended.push({ ...z.e });
    else if (a.dir === 'in') passing.push({ first: a.e, last: z.e });
    else returned.push({ first: a.e, last: z.e });
  }
  if (first.vacantFrom - ended.length + added.length !== last.vacantTo) {
    throw new Error(`changes ${from} -> ${to}: the codes do not add up to the change`);
  }
  const byPop = (x: PeriodEntry, y: PeriodEntry) => (y.population ?? 0) - (x.population ?? 0)
    || x.settlement.localeCompare(y.settlement, 'hu');
  added.sort(byPop);
  ended.sort(byPop);
  passing.sort((x, y) => byPop(x.first, y.first));
  returned.sort((x, y) => byPop(x.first, y.first));

  const counties = new Map<string, Period['counties'][number]>();
  const row = (c: string) => {
    if (!counties.has(c)) counties.set(c, { county: c, vacantFrom: 0, vacantTo: 0, added: 0, ended: 0 });
    return counties.get(c)!;
  };
  for (const c of first.counties) row(c.county).vacantFrom = c.vacantFrom;
  for (const c of last.counties) row(c.county).vacantTo = c.vacantTo;
  for (const e of added) row(e.county).added += 1;
  for (const e of ended) row(e.county).ended += 1;

  const types = new Set([...Object.keys(first.byType), ...Object.keys(last.byType)]);
  return {
    from: first.from, to: last.to, months: monthsBetween(first.from, last.to), pairs: inside,
    vacantFrom: first.vacantFrom, vacantTo: last.vacantTo,
    populationFrom: first.populationFrom, populationTo: last.populationTo,
    totalFrom: first.totalFrom, totalTo: last.totalTo,
    longTermFrom: first.longTermFrom, longTermTo: last.longTermTo,
    moves: { ended: inside.reduce((s, p) => s + p.flows.ended, 0),
      added: inside.reduce((s, p) => s + p.flows.newVacant, 0) },
    added, ended, passing, returned,
    counties: [...counties.values()].sort((a, b) => a.county.localeCompare(b.county, 'hu')),
    doctorChanges: inside.every((p) => p.doctorChanges !== null)
      ? inside.reduce((s, p) => s + (p.doctorChanges ?? 0), 0) : null,
    byType: Object.fromEntries([...types].map((t) => [t, [first.byType[t]?.[0] ?? 0, last.byType[t]?.[1] ?? 0]])),
  };
}

const FATES = ['filled', 'toDissolved', 'leftRegistry', 'unknownFate'] as const;
const ORIGINS = ['fromFilled', 'fromDissolved', 'newDistrict', 'unknownOrigin'] as const;

/** "2026-04" as the narrow tables write it. */
const short = (ym: string) => ym.replace('-', '.');

const branches = (c: Ctx): Branch[] => (c.o.branch === 'both' ? ['gp', 'dental'] : [c.o.branch]);
const want = (c: Ctx, id: string) => c.o.sections.includes(id);
const style = (c: Ctx): ChartStyle => ({ width: c.width, palette: PALETTES[c.o.palette], font: c.font,
  grid: c.o.grid, labels: c.o.labels, size: c.o.chartSize });
const chart = (c: Ctx, title: string, made: { svg: string }, caption: string): Block =>
  ({ kind: 'chart', title, svg: made.svg, width: c.width, caption });

export function changesReport(c: Ctx, input: ChangesInput): Report {
  const { T, o } = c;
  const L = o.lang;
  const all = periodMonths(input.changes);
  const from = o.fromMonth && all.includes(o.fromMonth) ? o.fromMonth : all[all.length - 2];
  const to = o.toMonth && all.includes(o.toMonth) && o.toMonth > from ? o.toMonth : all[all.length - 1];
  const periods = Object.fromEntries(branches(c).map((b) =>
    [b, periodOf(input.changes.kinds[b].monthly, from, to)])) as Record<Branch, Period | null>;
  const head = (b: Branch): Block => ({ kind: 'h3', text: T(`pdf.changes.branch.${b}`) });
  const none = (b: Branch): Block => {
    const pairs = input.changes.kinds[b].monthly;
    const around = pairs.find((p) => p.from < to && p.to > from);
    return { kind: 'note', text: around
      ? T('pdf.changes.noPair', { from: month(L, from), to: month(L, to), a: month(L, around.from), b: month(L, around.to) })
      : T('pdf.changes.noPairAtAll', { from: month(L, from), to: month(L, to) }) };
  };
  const sections: Section[] = [];

  if (want(c, 'summary')) {
    const blocks: Block[] = [{ kind: 'p', text: T('pdf.changes.summaryLead', {
      from: month(L, from), to: month(L, to), n: monthsBetween(from, to) }) }];
    for (const b of branches(c)) {
      const p = periods[b];
      blocks.push(head(b));
      if (!p) { blocks.push(none(b)); continue; }
      const net = p.vacantTo - p.vacantFrom;
      blocks.push({ kind: 'p', text: T(net > 0 ? 'pdf.changes.summaryUp' : net < 0 ? 'pdf.changes.summaryDown'
        : 'pdf.changes.summaryFlat', {
        from: month(L, p.from), to: month(L, p.to), vfrom: num(L, p.vacantFrom), vto: num(L, p.vacantTo),
        net: signed(L, net, 0), rel: p.vacantFrom ? signed(L, (net / p.vacantFrom) * 100, 1, '%') : '–',
        pairs: p.pairs.length }) });
      // the moves that came back are said only when there were any
      const back = p.passing.length + p.returned.length;
      blocks.push({ kind: 'p', text: [T('pdf.changes.summaryCodes', {
        added: num(L, p.added.length), ended: num(L, p.ended.length) }),
      ...(back ? [T('pdf.changes.summaryBack', {
        passing: num(L, p.passing.length), returned: num(L, p.returned.length),
        movesAdded: num(L, p.moves.added), movesEnded: num(L, p.moves.ended) })] : [])].join(' ') });
      const fate = (k: string) => p.ended.filter((e) => e.how === k).length;
      const origin = (k: string) => p.added.filter((e) => e.how === k).length;
      if (p.ended.length) {
        blocks.push({ kind: 'p', text: T('pdf.changes.summaryFates', {
          filled: num(L, fate('filled')), dissolved: num(L, fate('toDissolved')),
          left: num(L, fate('leftRegistry')), unknown: num(L, fate('unknownFate')) }) });
      }
      if (p.added.length) {
        blocks.push({ kind: 'p', text: T('pdf.changes.summaryOrigins', {
          filled: num(L, origin('fromFilled')), dissolved: num(L, origin('fromDissolved')),
          fresh: num(L, origin('newDistrict')), unknown: num(L, origin('unknownOrigin')) }) });
      }
      const rows: [string, string][] = [
        [T('pdf.changes.fact.vacant'), `${num(L, p.vacantFrom)} → ${num(L, p.vacantTo)} (${signed(L, net, 0)})`],
      ];
      if (p.populationFrom !== null && p.populationTo !== null) {
        rows.push([T('pdf.changes.fact.population'), `${num(L, p.populationFrom)} → ${num(L, p.populationTo)} (${signed(L, p.populationTo - p.populationFrom, 0)})`]);
      }
      if (p.totalFrom !== null && p.totalTo !== null) {
        rows.push([T('pdf.changes.fact.total'), `${num(L, p.totalFrom)} → ${num(L, p.totalTo)} (${signed(L, p.totalTo - p.totalFrom, 0)})`]);
        rows.push([T('pdf.changes.fact.rate'), `${pct(L, p.vacantFrom / p.totalFrom)} → ${pct(L, p.vacantTo / p.totalTo)}`]);
      }
      if (p.longTermFrom !== null && p.longTermTo !== null) {
        rows.push([T('pdf.changes.fact.longTerm'), `${num(L, p.longTermFrom)} → ${num(L, p.longTermTo)}`]);
      }
      if (p.doctorChanges !== null) rows.push([T('pdf.changes.fact.doctorChanges'), num(L, p.doctorChanges)]);
      blocks.push({ kind: 'facts', rows });
    }
    blocks.push({ kind: 'note', text: T('pdf.care.caveat') });
    sections.push({ id: 'summary', title: T('pdf.changes.section.summary'), blocks });
  }

  if (want(c, 'context')) {
    const blocks: Block[] = [{ kind: 'p', text: T('pdf.changes.contextLead') }];
    for (const b of branches(c)) {
      const p = periods[b];
      const ts = input.timeseries[b].filter((x) => x.month <= to);
      const k = input.changes.kinds[b];
      blocks.push(head(b));
      const now = ts[ts.length - 1];
      if (!now) continue;
      const lines: string[] = [];
      // the archived month nearest to a year before the end: the archive is
      // not evenly spaced, so the gap is said, never assumed to be twelve
      const earlier = ts.filter((x) => monthsBetween(x.month, now.month) >= 6);
      const yearAgo = earlier.length ? earlier.reduce((m, x) => (Math.abs(monthsBetween(x.month, now.month) - 12)
        < Math.abs(monthsBetween(m.month, now.month) - 12) ? x : m)) : undefined;
      const gap = yearAgo ? monthsBetween(yearAgo.month, now.month) : 0;
      if (yearAgo) {
        lines.push(T(gap === 12 ? 'pdf.changes.contextYearAgo' : 'pdf.changes.contextMonthsAgo', {
          then: month(L, yearAgo.month), v: num(L, yearAgo.vacant), gap,
          now: month(L, now.month), n: num(L, now.vacant), d: signed(L, now.vacant - yearAgo.vacant, 0) }));
      }
      const yearEnd = [...k.years].reverse().find((y) => y.month < from || (y.month <= from && !y.partial));
      if (yearEnd && yearEnd.month !== yearAgo?.month) {
        lines.push(T('pdf.changes.contextYearEnd', { then: month(L, yearEnd.month), v: num(L, yearEnd.vacant),
          d: signed(L, now.vacant - yearEnd.vacant, 0) }));
      }
      const first = ts[0];
      lines.push(T('pdf.changes.contextFirst', { then: month(L, first.month), v: num(L, first.vacant),
        d: signed(L, now.vacant - first.vacant, 0) }));
      const peak = ts.reduce((m, x) => (x.vacant > m.vacant ? x : m), ts[0]);
      const low = ts.reduce((m, x) => (x.vacant < m.vacant ? x : m), ts[0]);
      lines.push(T('pdf.changes.contextRange', { hi: num(L, peak.vacant), hiMonth: month(L, peak.month),
        lo: num(L, low.vacant), loMonth: month(L, low.month), n: ts.length }));
      if (p && p.months > 0 && yearAgo && gap !== p.months) {
        const perMonth = (p.vacantTo - p.vacantFrom) / p.months;
        const perMonthYear = (now.vacant - yearAgo.vacant) / gap;
        lines.push(T('pdf.changes.contextPace', { a: signed(L, perMonth, 1), b: signed(L, perMonthYear, 1), gap }));
      }
      blocks.push({ kind: 'p', text: lines.join(' ') });
      blocks.push(chart(c, T(`pdf.changes.chart.trend.${b}`), lineChart([
        { label: T('pdf.changes.line.vacant'), values: ts.map((x) => x.vacant), focus: true },
      ], ts.map((x) => month(L, x.month)), style(c), (v) => num(L, v)), T('pdf.changes.chart.trendCaption')));
      blocks.push({ kind: 'table', head: [T('pdf.col.year'), T('pdf.changes.col.month'), T('pdf.changes.col.vacant'),
        T('pdf.changes.col.population'), T('pdf.changes.col.longTerm')],
      align: ['left', 'left', 'right', 'right', 'right'],
      rows: k.years.map((y) => [`${y.year}${y.partial ? '*' : ''}`, month(L, y.month), num(L, y.vacant),
        num(L, y.population), num(L, y.longTerm)]) });
    }
    blocks.push({ kind: 'note', text: T('pdf.changes.contextNote') });
    sections.push({ id: 'context', title: T('pdf.changes.section.context'), blocks });
  }

  if (want(c, 'months')) {
    const blocks: Block[] = [{ kind: 'p', text: T('pdf.changes.monthsLead') }];
    for (const b of branches(c)) {
      const p = periods[b];
      blocks.push(head(b));
      if (!p) { blocks.push(none(b)); continue; }
      // two tables, so twelve columns never run off a portrait page: the
      // counts, then what became of the districts that left the list
      const pair = (q: ChangePair) => `${short(q.from)} → ${short(q.to)}`;
      blocks.push({ kind: 'table',
        head: [T('pdf.changes.col.pair'), T('pdf.changes.col.span'), T('pdf.changes.col.start'),
          T('pdf.changes.col.end'), T('pdf.changes.col.net'), T('pdf.changes.col.new'), T('pdf.changes.col.ended')],
        align: ['left', 'right', 'right', 'right', 'right', 'right', 'right'],
        widths: ['*', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto'],
        rows: p.pairs.map((q) => [pair(q), num(L, q.months), num(L, q.vacantFrom), num(L, q.vacantTo),
          signed(L, q.vacantTo - q.vacantFrom, 0), num(L, q.flows.newVacant), num(L, q.flows.ended)]) });
      blocks.push({ kind: 'table',
        head: [T('pdf.changes.col.pair'), T('pdf.changes.col.filled'), T('pdf.changes.col.toDissolved'),
          T('pdf.changes.col.left'), T('pdf.changes.col.unknown'), T('pdf.changes.col.doctors')],
        align: ['left', 'right', 'right', 'right', 'right', 'right'],
        widths: ['*', 'auto', 'auto', 'auto', 'auto', 'auto'],
        rows: p.pairs.map((q) => [pair(q), num(L, q.flows.filled), num(L, q.flows.toDissolved),
          num(L, q.flows.leftRegistry), num(L, q.flows.unknownFate), num(L, q.doctorChanges)]) });
      if (p.pairs.length > 1) {
        blocks.push(chart(c, T(`pdf.changes.chart.net.${b}`), barChart(p.pairs.map((q) => ({
          label: pair(q), value: q.vacantTo - q.vacantFrom,
          display: signed(L, q.vacantTo - q.vacantFrom, 0) })), style(c), (v) => signed(L, v, 0)),
        T('pdf.changes.chart.netCaption')));
      }
    }
    blocks.push({ kind: 'note', text: T('pdf.changes.monthsNote') });
    sections.push({ id: 'months', title: T('pdf.changes.section.months'), blocks });
  }

  if (want(c, 'flows')) {
    const blocks: Block[] = [{ kind: 'p', text: T('pdf.changes.flowsLead') }];
    for (const b of branches(c)) {
      const p = periods[b];
      blocks.push(head(b));
      if (!p) { blocks.push(none(b)); continue; }
      const sum = (k: keyof ChangePair['flows']) => p.pairs.reduce((s, q) => s + q.flows[k], 0);
      blocks.push({ kind: 'table', head: [T('pdf.changes.col.fate'), T('pdf.changes.col.stretch'), T('pdf.changes.col.moves')],
        align: ['left', 'right', 'right'], widths: ['*', 'auto', 'auto'],
        rows: [
          ...FATES.map((k) => [T(`changes.how.${k}`), num(L, p.ended.filter((e) => e.how === k).length), num(L, sum(k))]),
          [T('pdf.changes.endedTotal'), num(L, p.ended.length), num(L, p.moves.ended)],
        ] });
      blocks.push({ kind: 'table', head: [T('pdf.changes.col.origin'), T('pdf.changes.col.stretch'), T('pdf.changes.col.moves')],
        align: ['left', 'right', 'right'], widths: ['*', 'auto', 'auto'],
        rows: [
          ...ORIGINS.map((k) => [T(`changes.how.${k}`), num(L, p.added.filter((e) => e.how === k).length), num(L, sum(k))]),
          [T('pdf.changes.addedTotal'), num(L, p.added.length), num(L, p.moves.added)],
        ] });
      blocks.push({ kind: 'p', text: T('pdf.changes.flowsBack', {
        passing: num(L, p.passing.length), returned: num(L, p.returned.length) }) });
    }
    sections.push({ id: 'flows', title: T('pdf.changes.section.flows'), blocks });
  }

  if (want(c, 'counties')) {
    const blocks: Block[] = [{ kind: 'p', text: T('pdf.changes.countiesLead') }];
    for (const b of branches(c)) {
      const p = periods[b];
      blocks.push(head(b));
      if (!p) { blocks.push(none(b)); continue; }
      const rows = [...p.counties].sort((x, y) => Math.abs(y.vacantTo - y.vacantFrom) - Math.abs(x.vacantTo - x.vacantFrom)
        || y.added + y.ended - x.added - x.ended || x.county.localeCompare(y.county, 'hu'));
      blocks.push({ kind: 'table', head: [T('pdf.col.county'), T('pdf.changes.col.start'), T('pdf.changes.col.end'),
        T('pdf.changes.col.net'), T('pdf.changes.col.new'), T('pdf.changes.col.ended')],
      align: ['left', 'right', 'right', 'right', 'right', 'right'],
      rows: [...rows.map((x) => [x.county, num(L, x.vacantFrom), num(L, x.vacantTo), signed(L, x.vacantTo - x.vacantFrom, 0),
        num(L, x.added), num(L, x.ended)]),
      [T('pdf.changes.country'), num(L, p.vacantFrom), num(L, p.vacantTo), signed(L, p.vacantTo - p.vacantFrom, 0),
        num(L, p.added.length), num(L, p.ended.length)]] });
      const moved = rows.filter((x) => x.vacantTo !== x.vacantFrom).slice(0, 12);
      if (moved.length) {
        blocks.push(chart(c, T(`pdf.changes.chart.counties.${b}`), barChart(moved.map((x) => ({
          label: x.county, value: x.vacantTo - x.vacantFrom, display: signed(L, x.vacantTo - x.vacantFrom, 0) })),
        style(c), (v) => signed(L, v, 0)), T('pdf.changes.chart.countiesCaption')));
      }
    }
    sections.push({ id: 'counties', title: T('pdf.changes.section.counties'), blocks });
  }

  if (want(c, 'types')) {
    const blocks: Block[] = [{ kind: 'p', text: T('pdf.changes.typesLead') }];
    for (const b of branches(c)) {
      const p = periods[b];
      blocks.push(head(b));
      if (!p) { blocks.push(none(b)); continue; }
      blocks.push({ kind: 'table', head: [T('pdf.col.type'), T('pdf.changes.col.start'), T('pdf.changes.col.end'),
        T('pdf.changes.col.net')], align: ['left', 'right', 'right', 'right'],
      rows: Object.entries(p.byType).map(([type, [a, z]]) => [T(`pdf.type.${type}`), num(L, a), num(L, z), signed(L, z - a, 0)]) });
    }
    sections.push({ id: 'types', title: T('pdf.changes.section.types'), blocks });
  }

  if (want(c, 'lists')) {
    const blocks: Block[] = [{ kind: 'p', text: T('pdf.changes.listsLead') }];
    const cut = <R>(rows: R[]) => (o.settlementLimit > 0 ? rows.slice(0, o.settlementLimit) : rows);
    const more = (shown: number, all: number): Block[] => (shown < all
      ? [{ kind: 'note', text: T('pdf.changes.listCut', { shown: num(L, shown), all: num(L, all) }) }] : []);
    const entryHead = [T('pdf.col.settlement'), T('pdf.col.county'), T('pdf.changes.col.population'),
      T('pdf.changes.col.what'), T('pdf.changes.col.when'), T('pdf.changes.col.fin')];
    const align: ('left' | 'right')[] = ['left', 'left', 'right', 'left', 'left', 'left'];
    const entryRow = (e: PeriodEntry) => [e.settlement, e.county, num(L, e.population), T(`changes.how.${e.how}`),
      month(L, e.month), e.id];
    for (const b of branches(c)) {
      const p = periods[b];
      blocks.push(head(b));
      if (!p) { blocks.push(none(b)); continue; }
      for (const [key, list] of [['added', p.added], ['ended', p.ended]] as const) {
        blocks.push({ kind: 'p', text: T(`pdf.changes.list.${key}`, { n: num(L, list.length) }) });
        if (!list.length) continue;
        const shown = cut(list);
        blocks.push({ kind: 'table', head: entryHead, align, rows: shown.map(entryRow) });
        blocks.push(...more(shown.length, list.length));
      }
      for (const [key, list] of [['passing', p.passing], ['returned', p.returned]] as const) {
        blocks.push({ kind: 'p', text: T(`pdf.changes.list.${key}`, { n: num(L, list.length) }) });
        if (!list.length) continue;
        const shown = cut(list);
        blocks.push({ kind: 'table', head: [T('pdf.col.settlement'), T('pdf.col.county'), T('pdf.changes.col.population'),
          T('pdf.changes.col.firstMove'), T('pdf.changes.col.lastMove'), T('pdf.changes.col.fin')],
        align, rows: shown.map(({ first, last }) => [first.settlement, first.county, num(L, first.population),
          `${T(`changes.how.${first.how}`)} (${month(L, first.month)})`,
          `${T(`changes.how.${last.how}`)} (${month(L, last.month)})`, first.id]) });
        blocks.push(...more(shown.length, list.length));
      }
    }
    sections.push({ id: 'lists', title: T('pdf.changes.section.lists'), blocks });
  }

  sections.push(endNotes(c, T('pdf.notes.dataMonth', { month: month(L, input.changes.dataMonth) }), [
    T('pdf.changes.notesMethod'), T('changes.caveat'), T('pdf.notes.data'), T('pdf.notes.vacant'),
    T('pdf.notes.disclaimer')]));
  return {
    title: T('pdf.changes.title', { from: month(L, from), to: month(L, to) }),
    subtitle: `${T('pdf.kind.changes')} · ${T(`pdf.branchLine.${o.branch}`)}`,
    sections, fileSlug: `${T('pdf.file.changes')}-${from}-${to}`,
  };
}
