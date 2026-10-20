// The European comparison (europa.html) as a PDF.
//
// Its parts are the indicators themselves, picked one by one: each gets the
// ranking of the chosen countries with the one in focus lit, its value and
// year, the EU-27 figure (or, said so, the members' median), and the source.
// The page's rules hold: one publisher per country per series, a value more
// than five years older than the newest shown but not ranked, no correlation
// across countries, and migration counted by place of training, never netted.
import {
  ranking, reference, standing, type EuIndicator, type EuropeRaw, type EuSection, type EuUnit,
} from '../lib/europe';
import { barChart, PALETTES, type ChartStyle } from './charts';
import { month, num } from './format';
import type { Ctx } from './report';
import { endNotes } from './analysisReport';
import type { Block, Catalog, Lang, Report, Section } from './types';
import type { Translate } from './report';

export const EU_SECTIONS: EuSection[] = ['needs', 'workforce', 'access', 'outcomes', 'spending', 'pay'];

const style = (c: Ctx): ChartStyle => ({ width: c.width, palette: PALETTES[c.o.palette], font: c.font,
  grid: c.o.grid, labels: c.o.labels, size: c.o.chartSize });

/** A value in its unit, in the export's language. */
export function euValue(lang: Lang, unit: EuUnit, v: number): string {
  switch (unit) {
    case 'pct': return `${num(lang, v, v < 10 ? 1 : 0)}%`;
    case 'per100k': case 'pps': case 'pctEu': return num(lang, Math.round(v));
    case 'ratio': return `${num(lang, v, 1)}×`;
    default: return num(lang, v, 1);
  }
}

const shows = (ind: EuIndicator, branch: 'gp' | 'dental' | 'both') =>
  !ind.part && (branch === 'both' || ind.branch === branch || ind.branch === 'both');

/** What the dialog offers: every indicator, under its section's name. */
export function europeCatalog(raw: EuropeRaw, T: Translate): Catalog {
  return { groups: [
    ...EU_SECTIONS.map((s) => ({ title: T(`europe.section.${s}.short`), items: Object.entries(raw.indicators)
      .filter(([, i]) => i.section === s && !i.part)
      .map(([k]) => ({ id: k, label: T(`europe.ind.${k}.name`) })) })).filter((g) => g.items.length),
    { title: T('pdf.europe.more'), items: [
      { id: 'overview', label: T('pdf.europe.section.overview') },
      { id: 'migration', label: T('pdf.europe.section.migration') }] },
  ] };
}

/** The indicators a reader may pick by default: the ones the page opens with. */
export function europeDefaults(raw: EuropeRaw): string[] {
  return [...Object.entries(raw.indicators).filter(([, i]) => !i.part).map(([k]) => k), 'overview', 'migration'];
}

export function europeReport(c: Ctx, raw: EuropeRaw): Report {
  const { T, o } = c;
  const L = o.lang;
  const group = o.group ?? 'cee';
  const members = raw.groups[group];
  const focus = o.focus && members.includes(o.focus) ? o.focus : 'HU';
  const name = (g: string) => T(`europe.country.${g}`);
  const sections: Section[] = [];
  const picked = (k: string) => o.sections.includes(k) && shows(raw.indicators[k], o.branch);

  if (o.sections.includes('overview')) {
    const rows: string[][] = [];
    for (const s of EU_SECTIONS) {
      for (const [k, ind] of Object.entries(raw.indicators)) {
        if (ind.section !== s || !picked(k)) continue;
        const r = ranking(ind, members);
        const st = standing(r, focus);
        const own = r.find((x) => x.geo === focus);
        const ref = reference(ind, r);
        rows.push([T(`europe.ind.${k}.name`), own ? `${euValue(L, ind.unit, own.value)} (${own.year})` : '–',
          ind.better === 'neutral' ? T('pdf.europe.unranked') : st ? `${st.rank} / ${st.of}` : '–',
          ref ? `${euValue(L, ind.unit, ref.value)} ${T(ref.kind === 'eu' ? 'pdf.europe.refEu' : 'pdf.europe.refMedian')}` : '–']);
      }
    }
    sections.push({ id: 'overview', title: T('pdf.europe.section.overview'), blocks: [
      { kind: 'p', text: T('pdf.europe.overview.text', { country: name(focus), group: T(`europe.group.${group}`), n: members.length }) },
      { kind: 'table', head: [T('pdf.col.measure'), name(focus), T('pdf.col.rank'), T('pdf.col.reference')],
        align: ['left', 'right', 'right', 'right'], rows },
      { kind: 'note', text: T('pdf.europe.overview.note') },
    ] });
  }

  for (const s of EU_SECTIONS) {
    const keys = Object.entries(raw.indicators).filter(([k, i]) => i.section === s && picked(k)).map(([k]) => k);
    if (!keys.length) continue;
    const blocks: Block[] = [{ kind: 'p', text: T(`europe.section.${s}.lead`) }];
    for (const k of keys) {
      const ind = raw.indicators[k];
      const r = ranking(ind, members);
      const st = standing(r, focus);
      const own = r.find((x) => x.geo === focus);
      const ref = reference(ind, r);
      const fmt = (v: number) => euValue(L, ind.unit, v);
      blocks.push({ kind: 'h3', text: T(`europe.ind.${k}.name`) });
      blocks.push({ kind: 'p', text: [T(`europe.ind.${k}.explain`),
        own ? T('pdf.europe.value', { country: name(focus), value: fmt(own.value), year: own.year,
          unit: T(`europe.unit.${ind.unit}`) }) : T('pdf.europe.noValue', { country: name(focus) }),
        st ? T(ind.better === 'lower' ? 'pdf.europe.rankLower' : 'pdf.europe.rankHigher', { rank: st.rank, of: st.of }) : '',
        ref ? T(ref.kind === 'eu' ? 'pdf.europe.refEuText' : 'pdf.europe.refMedianText', { value: fmt(ref.value), year: ref.year }) : '',
      ].filter(Boolean).join(' ') });
      if (r.length) {
        const rows = r.map((x) => ({ label: `${name(x.geo)}${x.stale || x.year !== r[0].year ? ` (${x.year})` : ''}`,
          value: x.value, focus: x.geo === focus }));
        blocks.push({ kind: 'chart', title: T('pdf.europe.chartTitle', { name: T(`europe.ind.${k}.short`),
          group: T(`europe.group.${group}`) }), svg: barChart(rows, style(c), fmt).svg, width: c.width,
        caption: T('pdf.europe.caption', { unit: T(`europe.unit.${ind.unit}`),
          source: ind.source === 'oecd' ? 'OECD' : 'Eurostat', dataset: ind.dataset,
          order: T(ind.better === 'neutral' ? 'pdf.europe.orderNeutral' : 'pdf.europe.orderBest') }) });
      }
      const note = T(`europe.ind.${k}.note`);
      if (note !== `europe.ind.${k}.note`) blocks.push({ kind: 'note', text: note });
      if (r.some((x) => x.stale)) blocks.push({ kind: 'note', text: T('pdf.europe.staleNote') });
      if (r.some((x) => x.oecd)) blocks.push({ kind: 'note', text: T('pdf.europe.oecdNote') });
    }
    sections.push({ id: s, title: T(`europe.section.${s}.heading`), blocks });
  }

  if (o.sections.includes('migration')) {
    const inflow = raw.migration.inflow[focus];
    const outflow = raw.migration.outflow[focus];
    const carried = new Set(raw.countries);
    const regionNames = typeof Intl !== 'undefined' && 'DisplayNames' in Intl
      ? new Intl.DisplayNames([L], { type: 'region' }) : null;
    const nm = (g: string) => (carried.has(g) ? name(g) : regionNames?.of(g === 'UK' ? 'GB' : g === 'EL' ? 'GR' : g) ?? g);
    const blocks: Block[] = [{ kind: 'note', text: T('europe.migration.note') }];
    if (inflow) {
      blocks.push({ kind: 'p', text: T('pdf.europe.migration.in', { country: name(focus), year: inflow.year,
        n: num(L, inflow.foreign), domestic: inflow.domestic === null ? '–' : num(L, inflow.domestic) }) });
      blocks.push({ kind: 'chart', title: T('pdf.europe.migration.inChart', { country: name(focus) }),
        svg: barChart([...inflow.origins.map(([g, n]) => ({ label: nm(g), value: n })),
          ...(inflow.other ? [{ label: T('europe.migration.other'), value: inflow.other }] : [])], style(c),
        (v) => num(L, v)).svg, width: c.width, caption: T('pdf.europe.migration.caption', { dataset: raw.migration.dataset }) });
    }
    if (outflow?.destinations.length) {
      blocks.push({ kind: 'p', text: T('pdf.europe.migration.out', { country: name(focus), n: num(L, outflow.total),
        places: outflow.destinations.length }) });
      blocks.push({ kind: 'chart', title: T('pdf.europe.migration.outChart', { country: name(focus) }),
        svg: barChart(outflow.destinations.slice(0, 15).map(([g, y, n]) => ({ label: `${nm(g)} (${y})`, value: n })),
          style(c), (v) => num(L, v)).svg, width: c.width,
        caption: T('pdf.europe.migration.caption', { dataset: raw.migration.dataset }) });
    }
    if (!inflow && !outflow?.destinations.length) blocks.push({ kind: 'p', text: T('europe.migration.noIn') });
    sections.push({ id: 'migration', title: T('pdf.europe.section.migration'), blocks });
  }

  sections.push(endNotes(c, T('pdf.europe.dataMonth', { month: month(L, raw.built.slice(0, 7)) }), [
    T('pdf.europe.notesRules'), T('pdf.europe.notesLicence'), T('pdf.notes.disclaimer')]));
  return {
    title: T('pdf.europe.title', { country: name(focus) }),
    subtitle: `${T('pdf.kind.europe')} · ${T(`europe.group.${group}`)} · ${T(`pdf.branchLine.${o.branch}`)}`,
    sections, fileSlug: `${T('pdf.file.europe')}-${group}-${focus.toLowerCase()}`,
  };
}

