// The analysis page (elemzo.html) as a PDF: the country as a whole.
//
// The same rules as the area reports: every number from the JSON the page
// reads, sentences as templates, vacant ≠ unserved said where vacancy is
// counted, and an association never written as a cause.
import type { CountiesRaw } from '../lib/counties';
import type { DistrictsRaw } from '../lib/districts';
import type { OutcomesRaw } from '../lib/outcomes';
import { barChart, lineChart, PALETTES, stackedBar, type ChartStyle } from './charts';
import { month, num, pct } from './format';
import type { Ctx } from './report';
import type { Block, Report, Section } from './types';

type Branch = 'gp' | 'dental';

interface National {
  totalDistricts: number; vacant: number; dissolved: number; vacancyRate: number;
  populationVacant: number; populationDissolved: number; longTerm: number;
  populationTotal?: number; populationShare?: number;
  byType: Record<string, { total: number; vacant: number }>;
}
interface TimePoint { month: string; totalDistricts: number; vacant: number; dissolved: number;
  populationVacant: number }
interface SurvivalKind {
  overall: { spells: number; refilled: number; stillOpen: number; median: number | null;
    survival12: number; survival24: number; survival60: number;
    points: { month: number; survival: number }[] };
  byType: { key?: string; type?: string; spells: number; median: number | null; survival12: number }[];
}

export interface AnalysisInput {
  dataMonth: string;
  national: Record<Branch, National>;
  timeseries: Record<Branch, TimePoint[]>;
  survival: Record<Branch, SurvivalKind> | null;
  outcomes: OutcomesRaw | null;
  counties: CountiesRaw;
  districts: DistrictsRaw | null;
}

const branches = (c: Ctx): Branch[] => (c.o.branch === 'both' ? ['gp', 'dental'] : [c.o.branch]);
const want = (c: Ctx, id: string) => c.o.sections.includes(id);
const style = (c: Ctx): ChartStyle => ({ width: c.width, palette: PALETTES[c.o.palette], font: c.font,
  grid: c.o.grid, labels: c.o.labels, size: c.o.chartSize });
const chart = (c: Ctx, title: string, made: { svg: string }, caption: string): Block =>
  ({ kind: 'chart', title, svg: made.svg, width: c.width, caption });
const limit = <T>(c: Ctx, rows: T[]) => (c.o.settlementLimit > 0 ? rows.slice(0, c.o.settlementLimit) : rows);

export function analysisReport(c: Ctx, input: AnalysisInput): Report {
  const { T, o } = c;
  const L = o.lang;
  const sections: Section[] = [];

  if (want(c, 'national')) {
    const blocks: Block[] = [{ kind: 'note', text: T('pdf.care.caveat') }];
    for (const b of branches(c)) {
      const n = input.national[b];
      const notFilled = n.vacant + n.dissolved;
      blocks.push({ kind: 'p', text: T(`pdf.analysis.national.${b}`, {
        total: num(L, n.totalDistricts), vacant: num(L, n.vacant), dissolved: num(L, n.dissolved),
        rate: pct(L, n.vacancyRate), longTerm: num(L, n.longTerm),
        people: num(L, n.populationVacant + n.populationDissolved),
        share: n.populationShare === undefined ? '–' : pct(L, n.populationShare) }) });
      // the palette's parts run green, amber, red: filled, dissolved, vacant
      blocks.push(chart(c, T(`pdf.analysis.national.chart.${b}`), stackedBar([
        { label: T('pdf.cards.filledDistricts'), value: n.totalDistricts - notFilled },
        { label: T('pdf.status.dissolved'), value: n.dissolved },
        { label: T('pdf.status.vacant'), value: n.vacant },
      ], style(c), (s) => pct(L, s)), T('pdf.analysis.national.caption')));
      blocks.push({ kind: 'table', head: [T('pdf.col.type'), T('pdf.col.total'), T('pdf.col.vacantN'), T('pdf.col.share')],
        align: ['left', 'right', 'right', 'right'],
        rows: Object.entries(n.byType).map(([type, x]) => [T(`pdf.type.${type}`), num(L, x.total), num(L, x.vacant),
          pct(L, x.total ? x.vacant / x.total : null)]) });
    }
    sections.push({ id: 'national', title: T('pdf.analysis.section.national'), blocks });
  }

  if (want(c, 'trend')) {
    const blocks: Block[] = [];
    for (const b of branches(c)) {
      const ts = input.timeseries[b];
      if (!ts?.length) continue;
      const first = ts[0];
      const last = ts[ts.length - 1];
      blocks.push({ kind: 'p', text: T(`pdf.analysis.trend.${b}`, {
        from: month(L, first.month), to: month(L, last.month),
        then: num(L, first.vacant + first.dissolved), now: num(L, last.vacant + last.dissolved),
        people: num(L, last.populationVacant), n: ts.length }) });
      blocks.push(chart(c, T(`pdf.analysis.trend.chart.${b}`), lineChart([
        { label: T(`pdf.analysis.trend.line.${b}`), values: ts.map((p) => p.vacant + p.dissolved), focus: true },
      ], ts.map((p) => month(L, p.month)), style(c), (v) => num(L, v)), T('pdf.analysis.trend.caption')));
    }
    sections.push({ id: 'trend', title: T('pdf.analysis.section.trend'), blocks });
  }

  if (want(c, 'counties')) {
    const blocks: Block[] = [{ kind: 'p', text: T('pdf.ranking.countyText') }];
    for (const b of branches(c)) {
      const rows = input.counties.counties.map((x) => ({ label: x.name, value: x[`${b}Districts`]?.rate ?? null }))
        .sort((p, q) => (q.value ?? -1) - (p.value ?? -1));
      blocks.push(chart(c, T(`pdf.ranking.chartTitle.${b}`), barChart(limit(c, rows), style(c), (v) => pct(L, v)),
        T('pdf.analysis.rankingCaption')));
    }
    sections.push({ id: 'counties', title: T('pdf.analysis.section.counties'), blocks });
  }

  if (want(c, 'districts') && input.districts) {
    const rural = input.districts.districts.filter((d) => !d.isCapital);
    const blocks: Block[] = [{ kind: 'p', text: T('pdf.analysis.districts.text', { n: rural.length }) }];
    for (const b of branches(c)) {
      const rows = rural.map((d) => ({ label: `${d.name} (${d.county})`, value: d[`${b}Districts`]?.rate ?? null }))
        .sort((p, q) => (q.value ?? -1) - (p.value ?? -1));
      const top = c.o.settlementLimit > 0 ? rows.slice(0, c.o.settlementLimit) : rows.slice(0, 40);
      blocks.push(chart(c, T(`pdf.analysis.districts.chart.${b}`, { n: top.length }),
        barChart(top, style(c), (v) => pct(L, v)), T('pdf.analysis.rankingCaption')));
    }
    sections.push({ id: 'districts', title: T('pdf.analysis.section.districts'), blocks });
  }

  if (want(c, 'survival') && input.survival) {
    const blocks: Block[] = [{ kind: 'p', text: T('pdf.analysis.survival.lead') }];
    for (const b of branches(c)) {
      const s = input.survival[b]?.overall;
      if (!s) continue;
      blocks.push({ kind: 'p', text: T(`pdf.analysis.survival.${b}`, {
        spells: num(L, s.spells), refilled: num(L, s.refilled), open: num(L, s.stillOpen),
        median: s.median === null ? '–' : num(L, s.median), s12: pct(L, s.survival12, 0),
        s24: pct(L, s.survival24, 0), s60: pct(L, s.survival60, 0) }) });
      const pts = s.points.filter((p) => p.month <= 120);
      blocks.push(chart(c, T(`pdf.analysis.survival.chart.${b}`), lineChart([
        { label: T('pdf.analysis.survival.line'), values: pts.map((p) => p.survival * 100), focus: true },
      ], pts.map((p) => T('pdf.analysis.survival.month', { n: p.month })), style(c), (v) => `${num(L, v, 0)}%`),
      T('pdf.analysis.survival.caption')));
    }
    sections.push({ id: 'survival', title: T('pdf.analysis.section.survival'), blocks });
  }

  const out = input.outcomes;
  if (want(c, 'forecast') && out) {
    const blocks: Block[] = [];
    for (const b of branches(c)) {
      const f = out.forecast.kinds[b]?.national as unknown as { vacantNow: number; vacantIn12: number;
        vacantIn12Band: [number, number]; expectedNew: number; expectedRefills: number; rateNow: number;
        rateIn12: number; path: number[] } | undefined;
      if (!f) continue;
      blocks.push({ kind: 'p', text: T(`pdf.analysis.forecast.${b}`, {
        now: num(L, f.vacantNow), later: num(L, f.vacantIn12, 0), lo: num(L, f.vacantIn12Band[0], 0),
        hi: num(L, f.vacantIn12Band[1], 0), fresh: num(L, f.expectedNew, 0), refill: num(L, f.expectedRefills, 0),
        rateNow: pct(L, f.rateNow), rateLater: pct(L, f.rateIn12) }) });
      const start = out.forecast.kinds[b].month;
      const [y, m] = start.split('-').map(Number);
      const months = f.path.map((_, i) => {
        const d = new Date(Date.UTC(y, m - 1 + i, 1));
        return month(L, `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
      });
      blocks.push(chart(c, T(`pdf.analysis.forecast.chart.${b}`), lineChart([
        { label: T('pdf.analysis.forecast.line'), values: f.path, focus: true },
      ], months, style(c), (v) => num(L, v, 0)), T('pdf.analysis.forecast.caption')));
    }
    blocks.push({ kind: 'note', text: T('pdf.forecast.method') });
    sections.push({ id: 'forecast', title: T('pdf.analysis.section.forecast'), blocks });
  }

  if (want(c, 'correlations') && out) {
    // gpLongTerm is the vacancy itself, and the ischaemic series in
    // outcomes.json is a copy of the hypertension one (an ETL fault, reported):
    // neither belongs in a table of what goes with vacancy
    const pairs = out.correlations.pairs.filter((p) => p.x === 'gpRate' && p.y !== 'gpLongTerm'
      && p.y !== 'ischaemic');
    const partial = (y: string) => out.correlations.partials.find((p) => p.x === 'gpRate' && p.y === y
      && p.control === 'income');
    sections.push({ id: 'correlations', title: T('pdf.analysis.section.correlations'), blocks: [
      { kind: 'p', text: T('pdf.analysis.correlations.text', { n: pairs[0]?.n ?? 174 }) },
      { kind: 'table', head: [T('pdf.col.measure'), 'r', 'ρ', T('pdf.col.partialIncome'), 'p'],
        align: ['left', 'right', 'right', 'right', 'right'],
        rows: [...pairs].sort((a, b) => Math.abs(b.r) - Math.abs(a.r)).map((p) => {
          const q = partial(p.y);
          return [T(`outcomes.measure.${p.y}`) === `outcomes.measure.${p.y}` ? p.y : T(`outcomes.measure.${p.y}`),
            num(L, p.r, 2), num(L, p.rho, 2), q ? num(L, q.partial, 2) : '–',
            p.p < 0.001 ? `< ${num(L, 0.001, 3)}` : num(L, p.p, 3)];
        }) },
      { kind: 'note', text: T('pdf.analysis.correlations.note') },
    ] });
  }

  if (want(c, 'grid') && out) {
    const g = out.grid.avoidable;
    const cut = (v: number) => num(L, v / 1000, 2);
    const head = [T('pdf.analysis.grid.corner'), T('pdf.analysis.grid.vacLow', { a: pct(L, g.vacancyCuts[0], 0) }),
      T('pdf.analysis.grid.vacMid', { a: pct(L, g.vacancyCuts[0], 0), b: pct(L, g.vacancyCuts[1], 0) }),
      T('pdf.analysis.grid.vacHigh', { b: pct(L, g.vacancyCuts[1], 0) })];
    const incomeRows = [T('pdf.analysis.grid.incLow', { a: cut(g.incomeCuts[0]) }),
      T('pdf.analysis.grid.incMid', { a: cut(g.incomeCuts[0]), b: cut(g.incomeCuts[1]) }),
      T('pdf.analysis.grid.incHigh', { b: cut(g.incomeCuts[1]) })];
    sections.push({ id: 'grid', title: T('pdf.analysis.section.grid'), blocks: [
      { kind: 'p', text: T('pdf.analysis.grid.text') },
      { kind: 'table', head, align: ['left', 'right', 'right', 'right'],
        rows: g.cells.map((row, i) => [incomeRows[i], ...row.map((cell) => (cell.median === null ? '–'
          : T('pdf.analysis.grid.cell', { v: num(L, cell.median, 0), n: cell.n })))]) },
      { kind: 'note', text: T('pdf.analysis.grid.note') },
    ] });
  }

  if (want(c, 'grants') && out) {
    const blocks: Block[] = [{ kind: 'p', text: T('pdf.analysis.grants.text', { month: month(L, out.grants.kinds.gp?.latestMonth) }) }];
    for (const b of branches(c)) {
      const k = out.grants.kinds[b] as unknown as { byProgrammeYear: { programme: string; year: number; winners: number;
        matched: number; ambiguous: number; filled: number; vacant: number; gone: number }[] } | undefined;
      if (!k?.byProgrammeYear?.length) continue;
      blocks.push({ kind: 'h3', text: T(`pdf.fact.state.${b}`) });
      blocks.push({ kind: 'table', head: [T('pdf.col.programme'), T('pdf.col.year'), T('pdf.col.winners'),
        T('pdf.col.matched'), T('pdf.col.nowFilled'), T('pdf.col.nowVacant'), T('pdf.col.gone')],
      align: ['left', 'right', 'right', 'right', 'right', 'right', 'right'],
      rows: k.byProgrammeYear.map((r) => [T(`pdf.analysis.grants.programme.${r.programme}`), String(r.year),
        num(L, r.winners), num(L, r.matched), num(L, r.filled), num(L, r.vacant), num(L, r.gone)]) });
    }
    blocks.push({ kind: 'note', text: T('pdf.analysis.grants.note') });
    sections.push({ id: 'grants', title: T('pdf.analysis.section.grants'), blocks });
  }

  if (want(c, 'emergency') && out) {
    const e = out.emergency;
    const total = Object.values(e.population).reduce((a, v) => a + v, 0) || 1;
    sections.push({ id: 'emergency', title: T('pdf.analysis.section.emergency'), blocks: [
      { kind: 'p', text: T('pdf.analysis.emergency.text', { points: num(L, e.points), median: num(L, e.medianMin, 1),
        max: num(L, e.maxMin, 1), beyond: num(L, e.beyond30), share: pct(L, e.beyond30 / total) }) },
      chart(c, T('pdf.analysis.emergency.chart'), barChart(e.bands.map((band) => ({
        label: T('pdf.analysis.emergency.band', { band }), value: e.population[band] ?? 0, focus: band === '30+' })),
      style(c), (v) => num(L, v)), T('pdf.analysis.emergency.caption')),
    ] });
  }

  sections.push(endNotes(c, T('pdf.notes.dataMonth', { month: month(L, input.dataMonth) }), [
    T('pdf.notes.data'), T('pdf.notes.vacant'), T('pdf.analysis.notesMethod'), T('pdf.notes.sources'),
    T('pdf.notes.disclaimer')]));
  return {
    title: T('pdf.analysis.title'),
    subtitle: `${T('pdf.kind.analysis')} · ${T(`pdf.branchLine.${o.branch}`)}`,
    sections, fileSlug: T('pdf.file.analysis'),
  };
}

/** The data month, set apart, and the notes when asked for. */
export function endNotes(c: Ctx, when: string, body: string[]): Section {
  const { T, o } = c;
  const first: Block = { kind: 'highlight', text: when };
  if (!o.notes) return { id: 'notes', title: T('pdf.section.dataMonth'), blocks: [first] };
  return { id: 'notes', title: T('pdf.section.notes'), blocks: [first,
    ...body.map((text) => ({ kind: 'p', text }) as Block)] };
}
