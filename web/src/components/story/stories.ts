// The stories of the public pages, one builder per page: each takes the data
// that page already loads and returns its scenes. Every number in a line is
// read from that data at run time — nothing is typed into a sentence — and
// every line is a statement the page itself makes further down. The words
// live in i18n (story.*); a Hungarian case ending is never glued to a
// number, the sentences are worded around it instead.
import { t, tKind, locale } from '../../lib/i18n';
import { formatDecimal, formatDuration, formatMonth, formatNumber, formatPercent, huArticle, monthsBetween } from '../../lib/format';
import { vacancyOf } from '../../lib/vacancy';
import { formatValue, latest, ranking, reference, type EuropeRaw, type GroupKey } from '../../lib/europe';
import type { DissolvedMode } from '../../lib/context';
import type { CountiesRaw, CountyAggregateRow } from '../../lib/counties';
import type { DistrictRow, DistrictsRaw } from '../../lib/districts';
import type { SurvivalKind } from '../../lib/analysis';
import type { OutcomesRaw } from '../../lib/outcomes';
import type { PraxisKind, Snapshot, TimeseriesMonth } from '../../types';
import type { Painter } from './paint';
import type { Scene } from './Story';
import { bars, bigNumber, columns, donut, houseShare, houses, line, people, pins, waffle } from './scenes';

const n = (v: number) => formatNumber(Math.round(v));
const pc = (v: number, d = 1) => formatPercent(v, d);
const dec = (v: number, d: number) => formatDecimal(v.toFixed(d));
const minutes = (v: number) => t('county.minutes', { n: dec(v, 1) });
/** "az" or "a" before a Hungarian number; nothing in English, where the templates do not ask for it. */
const art = (v: number) => (locale === 'en' ? '' : huArticle(v));
const kindColor = (p: Painter, kind: PraxisKind) => (kind === 'gp' ? p.c.gp : p.c.dental);

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/* -------------------------------------------------------------- landing */

export interface LandingInput {
  kind: PraxisKind;
  snapshot: Snapshot;
  months: TimeseriesMonth[];
  mode: DissolvedMode;
}

export function landingScenes({ kind, snapshot, months, mode }: LandingInput): Scene[] {
  const nat = snapshot.national;
  const parts = vacancyOf(nat, mode);
  const k = (key: string, params?: Record<string, string | number>) => tKind(`story.landing.${key}`, kind, params);
  const scenes: Scene[] = [];
  const total = parts.total;
  if (total) {
    scenes.push({
      say: k('total', { month: formatMonth(snapshot.month), total: n(total) }),
      draw: (p, tt) => bigNumber(p, total, n, tt, { label: k('totalLabel'), color: p.c.accent }),
    });
    const filled = Math.max(0, total - nat.vacant - nat.dissolved);
    scenes.push({
      say: k(parts.withDissolved ? 'vacantWith' : 'vacant', { vacant: n(parts.count), rate: pc(parts.rate ?? 0) }),
      mood: 'worried',
      draw: (p, tt) => waffle(p, [
        { n: filled, color: p.c.accent, label: t('story.common.filled') },
        { n: nat.vacant, color: p.c.alert, label: t('story.common.vacant') },
        ...(nat.dissolved ? [{ n: nat.dissolved, color: p.c.track, label: t('story.common.dissolved') }] : []),
      ], total, tt),
    });
  }
  if (nat.dissolved > 0) {
    scenes.push({
      say: k(parts.withDissolved ? 'dissolvedIn' : 'dissolvedOut', { n: n(nat.dissolved) }),
      draw: (p, tt) => columns(p, [
        { label: t('story.common.vacant'), value: nat.vacant, color: p.c.alert },
        { label: t('story.common.dissolved'), value: nat.dissolved, color: p.c.soft },
      ], n, tt),
    });
  }
  if (parts.population > 0) {
    const share = nat.populationTotal ? parts.population / nat.populationTotal : null;
    scenes.push({
      say: k('people', { people: n(parts.population) }),
      draw: (p, tt) => (share !== null
        ? people(p, 100, Math.round(share * 100), tt, p.c.alert)
        : bigNumber(p, parts.population, n, tt, { label: k('peopleLabel') })),
    });
  }
  scenes.push({
    say: k('caveat'),
    mood: 'proud',
    draw: (p, tt) => houses(p, houseShare(parts.rate ?? 0, p.c.soft, p.c.accent), tt),
  });
  if (typeof nat.longTerm === 'number' && nat.vacant > 0) {
    const lt = nat.longTerm;
    scenes.push({
      say: k('longTerm', { n: n(lt), month: formatMonth(snapshot.longTermAsOf ?? snapshot.month) }),
      mood: 'worried',
      draw: (p, tt) => donut(p, Math.min(1, lt / nat.vacant), tt, p.c.alert, { label: k('longTermShare') }),
    });
  }
  const spells = snapshot.praxes
    .filter((x) => (x.status === 'vacant' || x.status === 'vacant_longterm') && /^\d{4}-\d{2}$/.test(x.vacantSince))
    .map((x) => monthsBetween(x.vacantSince, snapshot.month))
    .filter((m) => m >= 0);
  const med = median(spells);
  if (med !== null) {
    const m = Math.round(med);
    scenes.push({
      say: k('duration', { dur: formatDuration(m) }),
      mood: 'surprised',
      draw: (p, tt) => bigNumber(p, m, (v) => formatDuration(Math.round(v)), tt, { label: k('durationLabel'), color: p.c.soft }),
    });
  }
  const series = months.map((m) => m.vacant + (parts.withDissolved ? m.dissolved : 0));
  if (months.length >= 2) {
    const a = months[0];
    const b = months[months.length - 1];
    scenes.push({
      say: k(parts.withDissolved ? 'trendWith' : 'trend', {
        from: formatMonth(a.month), a: n(series[0]), to: formatMonth(b.month), b: n(series[series.length - 1]) }),
      draw: (p, tt) => line(p, series, months.map((m) => formatMonth(m.month)), n, tt, p.c.accent),
    });
  }
  const ranked = snapshot.counties
    .map((c) => ({ name: c.name, rate: vacancyOf(c, mode).rate }))
    .filter((c): c is { name: string; rate: number } => c.rate !== null)
    .sort((a, b) => b.rate - a.rate);
  if (ranked.length >= 3) {
    const [c1, c2, c3] = ranked;
    scenes.push({
      say: k('counties', { c1: c1.name, r1: pc(c1.rate), c2: c2.name, r2: pc(c2.rate), c3: c3.name, r3: pc(c3.rate) }),
      mood: 'worried',
      draw: (p, tt) => bars(p, ranked.slice(0, 5).map((c) => ({ label: c.name, value: c.rate, color: p.c.alert })),
        (v) => pc(v), tt, parts.rate !== null ? { ref: { label: t('story.common.national'), value: parts.rate } } : {}),
    });
  }
  return scenes;
}

/* ----------------------------------------------------------- highlights */

export interface HighlightsInput {
  gp: { grantsFilled: number; matchedFilled: number; pairs: number };
  dental: { vacant: number; tenYears: number };
}
export interface EuropeFact {
  unit: Parameters<typeof formatValue>[0]; year: string; value: number; rank: number; of: number; median: number;
  eu: { year: string; value: number } | null;
  best: { geo: string; value: number; year: string };
  rural?: { year: string; value: number };
}
export interface EuropeSummaryInput { facts: { gp: EuropeFact; dental: EuropeFact } }

export function highlightsScenes(h: HighlightsInput, eu: EuropeSummaryInput | null): Scene[] {
  const k = (key: string, params?: Record<string, string | number>) => t(`story.highlights.${key}`, params);
  const { gp, dental } = h;
  const scenes: Scene[] = [
    {
      say: k('grant', { a: pc(gp.grantsFilled, 0) }), mascot: 'house', mood: 'proud',
      draw: (p, tt) => donut(p, gp.grantsFilled, tt, p.c.gp, { label: k('grantLabel') }),
    },
    {
      say: k('matched', { b: pc(gp.matchedFilled, 0), pairs: n(gp.pairs) }), mascot: 'house', mood: 'surprised',
      draw: (p, tt) => columns(p, [
        { label: k('withGrant'), value: gp.grantsFilled, color: p.c.gp },
        { label: k('withoutGrant'), value: gp.matchedFilled, color: p.c.track },
      ], (v) => pc(v, 0), tt),
    },
  ];
  if (dental.vacant > 0) {
    const share = dental.tenYears / dental.vacant;
    scenes.push(
      {
        say: k('ten', { vacant: n(dental.vacant), ten: n(dental.tenYears) }), mascot: 'tooth', mood: 'worried',
        draw: (p, tt) => houses(p, houseShare(share, p.c.alert, p.c.soft), tt),
      },
      {
        say: k('tenShare', { share: pc(share, 0) }), mascot: 'tooth', mood: 'worried',
        draw: (p, tt) => donut(p, share, tt, p.c.alert, { label: k('tenLabel') }),
      },
    );
  }
  if (eu) {
    const g = eu.facts.gp;
    const d = eu.facts.dental;
    const f = (x: EuropeFact, v: number) => formatValue(x.unit, v);
    const hu = t('europe.country.HU');
    const best = t(`europe.country.${g.best.geo}`);
    scenes.push(
      {
        say: k('euGp', { value: f(g, g.value), year: g.year, median: f(g, g.median) }), mascot: 'house', mood: 'worried',
        draw: (p, tt) => columns(p, [
          { label: hu, value: g.value, color: p.c.alert },
          { label: k('median'), value: g.median, color: p.c.gp },
          { label: best, value: g.best.value, color: p.c.s2 },
        ], (v) => f(g, v), tt),
      },
      {
        say: k('euGpRank', { art: art(g.rank), rank: g.rank, of: g.of, best, bestValue: f(g, g.best.value) }), mascot: 'house',
        draw: (p, tt) => houses(p, Array.from({ length: g.of }, (_, i) => (i === g.rank - 1 ? p.c.alert : p.c.gp)), tt),
      },
      {
        say: d.rural
          ? k('euDental', { value: f(d, d.value), year: d.year, rural: f(d, d.rural.value) })
          : k('euDentalNoRural', { value: f(d, d.value), year: d.year }),
        mascot: 'tooth', mood: 'surprised',
        draw: (p, tt) => people(p, 100, Math.round(d.value), tt, p.c.dental),
      },
      {
        say: d.eu
          ? k('euDentalEu', { eu: f(d, d.eu.value), art: art(d.rank), rank: d.rank, of: d.of })
          : k('euDentalMedian', { median: f(d, d.median), art: art(d.rank), rank: d.rank, of: d.of }),
        mascot: 'tooth',
        draw: (p, tt) => columns(p, [
          { label: hu, value: d.value, color: p.c.alert },
          ...(d.rural ? [{ label: k('rural'), value: d.rural.value, color: p.c.soft }] : []),
          d.eu ? { label: 'EU-27', value: d.eu.value, color: p.c.dental } : { label: k('median'), value: d.median, color: p.c.dental },
        ], (v) => f(d, v), tt),
      },
    );
  }
  return scenes;
}

/* ------------------------------------------------- county and járás pages */

type Area = Pick<CountyAggregateRow, 'name' | 'settlements' | 'population'
  | 'gpFilled' | 'gpPartial' | 'gpVacantOnly' | 'dentalFilled' | 'dentalPartial' | 'dentalVacantOnly'
  | 'medianGpMinutes' | 'medianDentalMinutes' | 'medianInpatientMinutes' | 'withoutDirectBus'
  | 'age' | 'gpDistricts' | 'dentalDistricts'>;

function areaScenes(a: Area, kind: PraxisKind, national: Snapshot | null, extra: { development?: Scene | null; bus: boolean }): Scene[] {
  const k = (key: string, params?: Record<string, string | number>) => tKind(`story.area.${key}`, kind, params);
  const scenes: Scene[] = [{
    say: k('size', { name: a.name, settlements: n(a.settlements), population: n(a.population) }),
    draw: (p, tt) => bigNumber(p, a.population, n, tt, { label: k('residents'), color: p.c.accent }),
  }];
  const age = a.age;
  if (age && age.total > 0) {
    scenes.push({
      say: k('age', { old: n(age.old), share: pc(age.old / age.total) }),
      mood: 'surprised',
      draw: (p, tt) => waffle(p, [
        { n: age.young, color: p.c.s2, label: t('age.part.young') },
        { n: age.working, color: p.c.accent, label: t('age.part.working') },
        { n: age.old, color: p.c.soft, label: t('age.part.old') },
      ], age.young + age.working + age.old, tt),
    });
  }
  for (const b of ['gp', 'dental'] as const) {
    const cell = b === 'gp' ? a.gpDistricts : a.dentalDistricts;
    if (!cell || !cell.total) continue;
    const kk = (key: string, params?: Record<string, string | number>) => tKind(`story.area.${key}`, b, params);
    const rate = cell.vacant / cell.total;
    scenes.push({
      say: kk(cell.dissolved ? 'districtsDissolved' : 'districts', {
        total: n(cell.total), vacant: n(cell.vacant), rate: pc(rate), dissolved: n(cell.dissolved) }),
      mascot: b === 'gp' ? 'house' : 'tooth',
      mood: rate > 0.15 ? 'worried' : 'happy',
      draw: (p, tt) => waffle(p, [
        { n: Math.max(0, cell.total - cell.vacant - cell.dissolved), color: kindColor(p, b), label: t('story.common.filled') },
        { n: cell.vacant, color: p.c.alert, label: t('story.common.vacant') },
        ...(cell.dissolved ? [{ n: cell.dissolved, color: p.c.track, label: t('story.common.dissolved') }] : []),
      ], cell.total, tt),
    });
  }
  const filled = kind === 'gp' ? a.gpFilled : a.dentalFilled;
  const partial = kind === 'gp' ? a.gpPartial : a.dentalPartial;
  const vacantOnly = kind === 'gp' ? a.gpVacantOnly : a.dentalVacantOnly;
  if (filled + partial + vacantOnly > 0) {
    scenes.push({
      say: k('settlements', { vacant: n(vacantOnly), partial: n(partial) }),
      draw: (p, tt) => waffle(p, [
        { n: filled, color: p.c.accent, label: t('story.common.settlFilled') },
        { n: partial, color: p.c.soft, label: t('story.common.settlPartial') },
        { n: vacantOnly, color: p.c.alert, label: t('story.common.settlVacant') },
      ], filled + partial + vacantOnly, tt),
    });
  }
  const own = kind === 'gp' ? a.gpDistricts : a.dentalDistricts;
  const nat = national ? vacancyOf(national.national, 'without') : null;
  if (own?.total && nat?.rate != null) {
    const here = own.vacant / own.total;
    const there = nat.rate;
    scenes.push({
      say: k('compare', { here: pc(here), national: pc(there) }),
      mood: here > there ? 'worried' : 'proud',
      draw: (p, tt) => columns(p, [
        { label: a.name, value: here, color: here > there ? p.c.alert : p.c.accent },
        { label: t('story.common.national'), value: there, color: p.c.s2 },
      ], (v) => pc(v), tt),
    });
  }
  if (extra.development) scenes.push(extra.development);
  if (a.medianGpMinutes !== null && a.medianDentalMinutes !== null && a.medianInpatientMinutes !== null) {
    const gp = a.medianGpMinutes;
    const de = a.medianDentalMinutes;
    const inp = a.medianInpatientMinutes;
    scenes.push({
      say: k('travel', { gp: minutes(gp), dental: minutes(de), inpatient: minutes(inp) }),
      draw: (p, tt) => bars(p, [
        { label: t('story.common.gp'), value: gp, color: p.c.gp },
        { label: t('story.common.dentist'), value: de, color: p.c.dental },
        { label: t('story.common.hospital'), value: inp, color: p.c.s5 },
      ], (v) => minutes(v), tt),
    });
  }
  if (extra.bus && a.settlements > 0) {
    const share = a.withoutDirectBus / a.settlements;
    scenes.push({
      say: k('bus', { n: n(a.withoutDirectBus) }),
      mood: a.withoutDirectBus ? 'worried' : 'happy',
      draw: (p, tt) => donut(p, share, tt, p.c.soft, { label: k('busLabel') }),
    });
  }
  return scenes;
}

/** megye.html with a county picked. */
export function countyScenes(data: CountiesRaw, county: string, kind: PraxisKind, national: Snapshot | null): Scene[] {
  const row = data.counties.find((c) => c.name === county);
  return row ? areaScenes(row, kind, national, { bus: true }) : [];
}

/** megye.html before a county is picked: the twenty side by side. */
export function countyOverviewScenes(snapshot: Snapshot, kind: PraxisKind, mode: DissolvedMode): Scene[] {
  const k = (key: string, params?: Record<string, string | number>) => tKind(`story.countyOverview.${key}`, kind, params);
  const parts = vacancyOf(snapshot.national, mode);
  const rows = snapshot.counties
    .map((c) => ({ name: c.name, count: vacancyOf(c, mode).count, rate: vacancyOf(c, mode).rate }))
    .filter((c): c is { name: string; count: number; rate: number } => c.rate !== null);
  if (rows.length < 3 || !parts.total) return [];
  const byRate = [...rows].sort((a, b) => b.rate - a.rate);
  const low = [...byRate].reverse();
  const byCount = [...rows].sort((a, b) => b.count - a.count);
  const three = (xs: typeof rows, f: (c: typeof rows[number]) => string) => ({
    c1: xs[0].name, r1: f(xs[0]), c2: xs[1].name, r2: f(xs[1]), c3: xs[2].name, r3: f(xs[2]) });
  const total = parts.total;
  return [
    {
      // the capital is one of the twenty rows, and it is not a county
      say: k(parts.withDissolved ? 'introWith' : 'intro', {
        n: n(rows.filter((c) => c.name !== 'Budapest').length), total: n(total), vacant: n(parts.count) }),
      draw: (p, tt) => houses(p, houseShare(parts.rate ?? 0, p.c.alert, p.c.accent, rows.length), tt),
    },
    {
      say: k('highest', three(byRate, (c) => pc(c.rate))), mood: 'worried',
      draw: (p, tt) => bars(p, byRate.slice(0, 5).map((c) => ({ label: c.name, value: c.rate, color: p.c.alert })), (v) => pc(v), tt,
        parts.rate !== null ? { ref: { label: t('story.common.national'), value: parts.rate } } : {}),
    },
    {
      say: k('lowest', three(low, (c) => pc(c.rate))), mood: 'happy',
      draw: (p, tt) => bars(p, low.slice(0, 5).map((c) => ({ label: c.name, value: c.rate, color: p.c.accent })), (v) => pc(v), tt,
        { max: byRate[0].rate, ...(parts.rate !== null ? { ref: { label: t('story.common.national'), value: parts.rate } } : {}) }),
    },
    {
      say: k('most', three(byCount, (c) => n(c.count))), mood: 'surprised',
      draw: (p, tt) => bars(p, byCount.slice(0, 5).map((c) => ({ label: c.name, value: c.count, color: p.c.soft })), n, tt),
    },
    {
      say: k('pick'), mood: 'proud',
      draw: (p, tt) => pins(p, byRate.slice(0, 3).map((c) => c.name), tt, p.c.paper),
    },
  ];
}

/** jaras.html with a járás picked. */
export function districtScenes(data: DistrictsRaw, name: string, kind: PraxisKind, national: Snapshot | null): Scene[] {
  const row = data.districts.find((d) => d.name === name);
  if (!row) return [];
  const dev = row.development;
  const ranked = data.districts.filter((d) => typeof d.development?.rank === 'number').length;
  const development: Scene | null = dev && typeof dev.rank === 'number' && ranked
    ? {
      say: tKind('story.area.development', kind, { rank: n(dev.rank), of: n(ranked) }),
      mood: dev.rank <= ranked / 3 ? 'worried' : 'happy',
      draw: (p, tt) => {
        const rank = dev.rank as number;
        bigNumber(p, rank, n, tt, { label: tKind('story.area.developmentLabel', kind, { of: n(ranked) }), color: p.c.s5 });
      },
    }
    : null;
  return areaScenes(row as DistrictRow & Area, kind, national, { development, bus: !development });
}

/** jaras.html before a járás is picked: the 197 side by side. */
export function districtOverviewScenes(data: DistrictsRaw, kind: PraxisKind): Scene[] {
  const k = (key: string, params?: Record<string, string | number>) => tKind(`story.districtOverview.${key}`, kind, params);
  const cell = (d: DistrictRow) => (kind === 'gp' ? d.gpDistricts : d.dentalDistricts);
  const rows = data.districts
    .map((d) => ({ name: d.name, c: cell(d) }))
    .filter((d): d is { name: string; c: NonNullable<ReturnType<typeof cell>> } => !!d.c && d.c.total > 0)
    .map((d) => ({ name: d.name, total: d.c.total, vacant: d.c.vacant, rate: d.c.vacant / d.c.total }));
  if (rows.length < 3) return [];
  const byRate = [...rows].sort((a, b) => b.rate - a.rate);
  const zero = rows.filter((d) => d.vacant === 0).length;
  const capital = data.districts.filter((d) => d.isCapital).length;
  return [
    {
      say: k('intro', { n: n(data.districts.length - capital), capital: n(capital) }),
      draw: (p, tt) => houses(p, houseShare(rows.filter((d) => d.vacant > 0).length / rows.length, p.c.soft, p.c.accent, 48), tt),
    },
    {
      say: k('highest', { c1: byRate[0].name, r1: pc(byRate[0].rate), c2: byRate[1].name, r2: pc(byRate[1].rate), c3: byRate[2].name, r3: pc(byRate[2].rate) }),
      mood: 'worried',
      draw: (p, tt) => bars(p, byRate.slice(0, 5).map((d) => ({ label: d.name, value: d.rate, color: p.c.alert })), (v) => pc(v), tt),
    },
    {
      say: k('zero', { zero: n(zero), of: n(rows.length) }), mood: 'happy',
      draw: (p, tt) => donut(p, zero / rows.length, tt, p.c.accent, { label: k('zeroLabel') }),
    },
    {
      say: k('pick'), mood: 'proud',
      draw: (p, tt) => pins(p, byRate.slice(0, 3).map((d) => d.name), tt, p.c.paper),
    },
  ];
}

/* ------------------------------------------------------------- analyses */

export function analysisScenes(kind: PraxisKind, survival: SurvivalKind | null, o: OutcomesRaw | null): Scene[] {
  const k = (key: string, params?: Record<string, string | number>) => tKind(`story.analysis.${key}`, kind, params);
  const scenes: Scene[] = [];
  if (survival) {
    const c = survival.overall;
    scenes.push({
      say: k('spells', { from: formatMonth(survival.months[0]), spells: n(c.spells) }),
      draw: (p, tt) => waffle(p, [
        { n: c.refilled, color: p.c.accent, label: k('refilled') },
        { n: c.stillOpen, color: p.c.alert, label: k('stillOpen') },
      ], c.refilled + c.stillOpen, tt),
    });
    const pts = c.points;
    const medIdx = c.median !== null ? pts.findIndex((q) => q.month >= (c.median as number)) : -1;
    scenes.push({
      say: c.median !== null ? k('median', { m: n(c.median) }) : k('noMedian'),
      mood: 'surprised',
      draw: (p, tt) => line(p, pts.map((q) => q.survival), pts.map((q) => t('story.analysis.monthTick', { m: q.month })),
        (v) => pc(v, 0), tt, p.c.soft, { lo: 0, hi: 1, mark: medIdx }),
    });
    if (c.survival60 !== null) {
      const s60 = c.survival60;
      scenes.push({
        say: k('s60', { s60: pc(s60, 0) }), mood: 'worried',
        draw: (p, tt) => donut(p, s60, tt, p.c.alert, { label: k('s60Label') }),
      });
    }
  }
  const fc = o?.forecast?.kinds?.[kind]?.national;
  if (fc) {
    scenes.push({
      say: k('forecast', { now: n(fc.vacantNow), in12: n(fc.vacantIn12), lo: n(fc.vacantIn12Band[0]), hi: n(fc.vacantIn12Band[1]) }),
      draw: (p, tt) => line(p, fc.path, fc.path.map((_, i) => (i ? t('story.analysis.plusMonths', { m: i }) : t('story.analysis.now'))), n, tt, p.c.accent),
    });
  }
  const m = o?.grants?.kinds?.[kind]?.matched;
  if (m && m.pairs > 0 && m.treatedFilled !== null && m.controlFilled !== null) {
    const a = m.treatedFilled;
    const b = m.controlFilled;
    scenes.push({
      say: k('grants', { a: pc(a, 0), b: pc(b, 0) }), mood: 'proud',
      draw: (p, tt) => columns(p, [
        { label: t('story.highlights.withGrant'), value: a, color: p.c.accent },
        { label: t('story.highlights.withoutGrant'), value: b, color: p.c.track },
      ], (v) => pc(v, 0), tt),
    });
  }
  const x = kind === 'gp' ? 'gpRate' : 'dentalRate';
  const pair = o?.correlations.pairs.find((q) => q.x === x && q.y === 'avoidable');
  const part = o?.correlations.partials.find((q) => q.x === x && q.y === 'avoidable' && q.control === 'income');
  if (pair) {
    scenes.push({
      say: k('corr', { n: n(pair.n), r: dec(pair.r, 2) }),
      draw: (p, tt) => bigNumber(p, pair.r, (v) => `r = ${dec(v, 2)}`, tt, { label: k('corrLabel'), color: p.c.soft }),
    });
    if (part) {
      scenes.push({
        say: k('partial', { p: dec(part.partial, 2) }), mood: 'surprised',
        draw: (p, tt) => columns(p, [
          { label: k('raw'), value: pair.r, color: p.c.soft },
          { label: k('incomeHeld'), value: part.partial, color: p.c.s2 },
        ], (v) => dec(v, 2), tt),
      });
    }
  }
  const e = o?.emergency;
  const far = e?.population?.['30+'];
  if (e && typeof far === 'number') {
    const totalPop = Object.values(e.population).reduce((a, b) => a + b, 0);
    scenes.push({
      say: k('sbo', { people: n(far) }), mood: 'worried',
      draw: (p, tt) => bars(p, e.bands.map((b) => ({ label: t('story.analysis.band', { b }), value: e.population[b] ?? 0, color: b === '30+' ? p.c.alert : p.c.accent })),
        n, tt, { max: totalPop > 0 ? Math.max(...Object.values(e.population)) : undefined }),
    });
  }
  return scenes;
}

/* --------------------------------------------------------------- Europe */

const EU_KEYS: Record<PraxisKind, string[]> = {
  gp: ['gpDensity', 'generalistDensity', 'physicians55', 'gpVisit', 'unmetMed', 'avoidable', 'treatable'],
  dental: ['dentistDensity', 'dentGraduates', 'dentVisit', 'unmetDent', 'outOfPocket', 'physicians55'],
};

export function europeScenes(raw: EuropeRaw, kind: PraxisKind, group: GroupKey): Scene[] {
  const k = (key: string, params?: Record<string, string | number>) => tKind(`story.europe.${key}`, kind, params);
  const members = raw.groups[group] ?? [];
  const name = (g: string) => t(`europe.country.${g}`);
  const scenes: Scene[] = [{
    say: k('intro', { group: t(`europe.group.${group}`), n: n(members.length) }),
    draw: (p, tt) => pins(p, members.slice(0, 6).map(name), tt, p.c.paper),
  }];
  for (const key of EU_KEYS[kind]) {
    const ind = raw.indicators[key];
    const label = t(`europe.ind.${key}.name`);
    // the ends of a dumbbell have no name of their own: they are not told alone
    if (!ind || ind.part || label === `europe.ind.${key}.name`) continue;
    const own = latest(ind.values.HU);
    if (!own) continue;
    const rows = ranking(ind, members);
    const ref = reference(ind, rows);
    const hu = rows.find((r) => r.geo === 'HU');
    const ranked = rows.filter((r) => r.rank !== null).length;
    const unit = t(`story.europe.unit.${ind.unit}`);
    const value = `${formatValue(ind.unit, own.value)}${unit ? ` ${unit}` : ''}`;
    const refText = ref ? t(ref.kind === 'eu' ? 'story.europe.refEu' : 'story.europe.refMedian', { value: formatValue(ind.unit, ref.value) }) : '';
    const params = { name: label, value, year: own.year, ref: refText, rank: hu?.rank ?? 0, of: ranked };
    const say = hu?.rank && ref ? k('factRank', params) : ref ? k('fact', params) : k('factOnly', params);
    // the reader sees Hungary among its neighbours in the ranking, at most nine rows
    const at = Math.max(0, rows.findIndex((r) => r.geo === 'HU'));
    const from = Math.max(0, Math.min(at - 4, rows.length - 9));
    const shown = rows.slice(from, from + 9);
    scenes.push({
      say,
      mood: hu?.rank && ranked && hu.rank > ranked / 2 ? 'worried' : 'happy',
      draw: (p, tt) => bars(p, shown.map((r) => ({ label: name(r.geo), value: r.value, color: r.geo === 'HU' ? p.c.alert : kindColor(p, kind) })),
        (v) => formatValue(ind.unit, v), tt,
        ref ? { ref: { label: ref.kind === 'eu' ? 'EU-27' : t('story.highlights.median'), value: ref.value } } : {}),
    });
  }
  return scenes;
}

/* ------------------------------------------------- "Ki lát el még?" page */

export interface SpecialistInput {
  vedono: { stats: { territorial: number; school: number; residentsPerTerritorial: number; youngPerTerritorial: number;
    settlementsWithPremises: number; settlementsTotal: number } };
  specialist: { stats: Record<'inpatient' | 'outpatient', { institutions: number; units: number }> };
  pharmacy: { stats: { pharmacies: number; settlements: number; settlementsTotal: number; residentsPerPharmacy: number } };
  gyse: { stats: { retailPremises: number; retailSettlements: number; settlementsTotal: number } };
}

export function specialistScenes({ vedono, specialist, pharmacy, gyse }: SpecialistInput): Scene[] {
  const k = (key: string, params?: Record<string, string | number>) => t(`story.specialist.${key}`, params);
  const v = vedono.stats;
  const inp = specialist.stats.inpatient;
  const out = specialist.stats.outpatient;
  const ph = pharmacy.stats;
  const gy = gyse.stats;
  return [
    {
      say: k('vedono', { territorial: n(v.territorial), school: n(v.school) }),
      draw: (p, tt) => columns(p, [
        { label: k('territorial'), value: v.territorial, color: p.c.accent },
        { label: k('school'), value: v.school, color: p.c.s2 },
      ], n, tt),
    },
    {
      say: k('vedonoLoad', { res: n(v.residentsPerTerritorial), young: n(v.youngPerTerritorial) }), mood: 'surprised',
      draw: (p, tt) => people(p, 100, Math.round((100 * v.youngPerTerritorial) / v.residentsPerTerritorial), tt, p.c.s2),
    },
    {
      say: k('vedonoPremises', { with: n(v.settlementsWithPremises), total: n(v.settlementsTotal) }),
      draw: (p, tt) => donut(p, v.settlementsWithPremises / v.settlementsTotal, tt, p.c.accent, { label: k('premisesLabel') }),
    },
    {
      say: k('inpatient', { inst: n(inp.institutions), units: n(inp.units) }), mood: 'proud',
      draw: (p, tt) => bigNumber(p, inp.units, n, tt, { label: k('wards'), color: p.c.s5 }),
    },
    {
      say: k('outpatient', { inst: n(out.institutions), rooms: n(out.units) }),
      draw: (p, tt) => columns(p, [
        { label: k('inpatientShort'), value: inp.institutions, color: p.c.s5 },
        { label: k('outpatientShort'), value: out.institutions, color: p.c.s2 },
      ], n, tt),
    },
    {
      say: k('pharmacy', { n: n(ph.pharmacies), per: n(ph.residentsPerPharmacy) }),
      draw: (p, tt) => bigNumber(p, ph.pharmacies, n, tt, { label: k('pharmacies'), color: p.c.accent }),
    },
    {
      say: k('pharmacyPlaces', { with: n(ph.settlements), total: n(ph.settlementsTotal) }), mood: 'worried',
      draw: (p, tt) => houses(p, houseShare(ph.settlements / ph.settlementsTotal, p.c.accent, p.c.track), tt),
    },
    {
      say: k('gyse', { premises: n(gy.retailPremises), settl: n(gy.retailSettlements) }), mood: 'surprised',
      draw: (p, tt) => donut(p, gy.retailSettlements / gy.settlementsTotal, tt, p.c.soft, { label: k('gyseLabel') }),
    },
  ];
}

/* ------------------------------------------------------ the method page */

export interface MethodInput {
  sources: { groups: { key: string; items: unknown[] }[] };
  timeseries: Partial<Record<PraxisKind, TimeseriesMonth[]>>;
  latest: Partial<Record<PraxisKind, Snapshot>>;
  month: string;
  pipeline: { finished: string; steps: { status: string }[] } | null;
  settlementPages: number | null;
}

export function methodScenes({ sources, timeseries, latest: snaps, month, pipeline, settlementPages }: MethodInput): Scene[] {
  const k = (key: string, params?: Record<string, string | number>) => t(`story.method.${key}`, params);
  // "own" lists the site's own repository and files, not a source
  const groups = sources.groups.filter((g) => g.key !== 'own');
  const files = groups.reduce((a, g) => a + g.items.length, 0);
  const d = timeseries.dental ?? [];
  const g = timeseries.gp ?? [];
  const scenes: Scene[] = [{
    say: k('sources', { groups: n(groups.length), files: n(files) }),
    draw: (p, tt) => bars(p, groups.slice(0, 6).map((x) => ({ label: t(`footer.src.${x.key}.title`).split(/\s+—\s+|:/)[0], value: x.items.length, color: p.c.accent })), n, tt),
  }];
  if (d.length && g.length) {
    scenes.push({
      say: k('archive', { d: n(d.length), g: n(g.length) }),
      draw: (p, tt) => columns(p, [
        { label: t('kinds.dental.label'), value: d.length, color: p.c.dental },
        { label: t('kinds.gp.label'), value: g.length, color: p.c.gp },
      ], n, tt),
    });
    const first = [d[0].month, g[0].month].sort()[0];
    scenes.push({
      say: k('span', { first: formatMonth(first), last: formatMonth(month) }),
      draw: (p, tt) => pins(p, [formatMonth(first), formatMonth(month)], tt, p.c.paper),
    });
  }
  const dt = snaps.dental?.national.totalDistricts;
  const gt = snaps.gp?.national.totalDistricts;
  if (dt && gt) {
    scenes.push({
      say: k('districts', { month: formatMonth(month), dental: n(dt), gp: n(gt) }),
      draw: (p, tt) => columns(p, [
        { label: t('kinds.dental.label'), value: dt, color: p.c.dental },
        { label: t('kinds.gp.label'), value: gt, color: p.c.gp },
      ], n, tt),
    });
  }
  scenes.push({
    say: k('fin'),
    draw: (p, tt) => houses(p, Array.from({ length: 16 }, (_, i) => (i === 11 ? p.c.track : p.c.accent)), tt),
  });
  if (settlementPages) {
    scenes.push({
      say: k('pages', { n: n(settlementPages) }), mood: 'proud',
      draw: (p, tt) => bigNumber(p, settlementPages, n, tt, { label: k('pagesLabel'), color: p.c.accent }),
    });
  }
  if (pipeline?.steps.length) {
    const ok = pipeline.steps.filter((s) => s.status === 'ok').length;
    const other = pipeline.steps.length - ok;
    const date = new Date(pipeline.finished);
    const when = Number.isNaN(date.getTime()) ? pipeline.finished
      : date.toLocaleDateString(locale === 'en' ? 'en-GB' : 'hu-HU', { year: 'numeric', month: 'long', day: 'numeric' });
    scenes.push({
      say: k('pipeline', { steps: n(pipeline.steps.length), ok: n(ok), date: when }), mood: 'proud',
      draw: (p, tt) => waffle(p, [
        { n: ok, color: p.c.accent, label: k('stepOk') },
        ...(other ? [{ n: other, color: p.c.alert, label: k('stepOther') }] : []),
      ], pipeline.steps.length, tt),
    });
  }
  scenes.push({
    say: k('loud'), mood: 'worried',
    draw: (p, tt) => pins(p, [k('pinSource'), k('pinCheck'), k('pinStop')], tt, p.c.paper),
  });
  return scenes;
}
