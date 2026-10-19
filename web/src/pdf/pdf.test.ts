import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { barChart, escapeXml, inkOn, lineChart, PALETTES, stackedBar, type ChartStyle } from './charts';
import { month, num, pct, slugify } from './format';
import { translator } from './i18n';
import {
  countyReport, districtReport, median, rankAscending, settlementReport, type Ctx,
  type SettlementProfile,
} from './report';
import { rings } from '../lib/projection';
import { defaultOptions, SECTIONS, type Lang, type Level, type Report } from './types';

const style: ChartStyle = { width: 400, palette: PALETTES.site, font: 'PlexSans', grid: true,
  labels: true, size: 'normal' };

const data = (name: string) => JSON.parse(readFileSync(resolve(__dirname, '../../../data', name), 'utf8'));

function ctx(level: Level, lang: Lang, over: Partial<Ctx['o']> = {}): Ctx {
  const o = { ...defaultOptions(level, lang), sections: SECTIONS[level], ...over };
  return { T: translator(lang), o, width: 511, font: 'PlexSans' };
}

/** Every string a report would print, flattened. */
function texts(r: Report): string[] {
  return [r.title, r.subtitle, ...r.sections.flatMap((s) => [s.title, ...s.blocks.flatMap((b) => {
    if (b.kind === 'p' || b.kind === 'note' || b.kind === 'highlight') return [b.text];
    if (b.kind === 'facts') return b.rows.flat();
    if (b.kind === 'table') return [...b.head, ...b.rows.flat()];
    if (b.kind === 'cards') return b.cards.flatMap((x) => [x.title, x.value, x.label, x.sub ?? '', ...x.legend.map((l) => l.text)]);
    return [b.title, b.caption];
  })]), ...(r.map ? [r.map.caption] : [])];
}

describe('the PDF charts', () => {
  it('draw one bar per row on white, with the focus in its own colour', () => {
    const { svg } = barChart([{ label: 'Győr', value: 3, focus: true }, { label: 'Pécs', value: 1 }], style);
    expect(svg).toContain('fill="#ffffff"');
    expect(svg.match(/<rect /g)?.length).toBe(3);
    expect(svg).toContain(PALETTES.site.focus);
    expect(svg).toContain('font-family="PlexSans"');
  });

  it('escape what they write, so a name cannot break the SVG', () => {
    expect(escapeXml('A & B <c> "d"')).toBe('A &amp; B &lt;c&gt; &quot;d&quot;');
    expect(barChart([{ label: '<x>', value: 1 }], style).svg).toContain('&lt;x&gt;');
  });

  it('leave a missing value without a bar instead of drawing a zero', () => {
    const { svg } = barChart([{ label: 'a', value: null }, { label: 'b', value: 2 }], { ...style, grid: false });
    expect(svg.match(/<rect /g)?.length).toBe(2);
    expect(svg).toContain('>–<');
  });

  it('put the axis at zero when a value is negative', () => {
    const { svg } = barChart([{ label: 'a', value: -2 }, { label: 'b', value: 2 }], style);
    expect(svg).toContain(`stroke="${PALETTES.site.muted}"`);
  });

  it('split a whole and name each part with its share', () => {
    const { svg } = stackedBar([{ label: 'x', value: 1 }, { label: 'y', value: 3 }], style, (s) => `${s * 100}%`);
    expect(svg).toContain('x (25%)');
    expect(svg).toContain('y (75%)');
  });

  it('break a line where a value is missing', () => {
    const { svg } = lineChart([{ label: 'a', values: [1, null, 3], focus: true }], ['2019', '2020', '2021'], style);
    expect(svg.match(/M/g)?.length).toBe(2);
  });

  it('write dark text on a light fill and light text on a dark one', () => {
    expect(inkOn('#ffffff')).toBe('#1a1a1a');
    expect(inkOn('#0b3d91')).toBe('#ffffff');
  });
});

describe('formatting in the language of the export', () => {
  it('writes Hungarian and English numbers each their own way', () => {
    expect(pct('hu', 0.1234)).toBe('12,3%');
    expect(pct('en', 0.1234)).toBe('12.3%');
    expect(num('en', 1234567)).toBe('1,234,567');
    expect(num('hu', null)).toBe('–');
    expect(month('hu', '2026-10')).toBe('2026. október');
    expect(month('en', '2026-10')).toBe('October 2026');
    expect(slugify('Győr-Moson-Sopron')).toBe('gyor-moson-sopron');
  });

  it('ranks and takes medians without counting the missing', () => {
    expect(rankAscending([3, null, 1, 2], 2)).toBe(2);
    expect(median([4, null, 1, 3])).toBe(3);
    expect(median([])).toBeNull();
  });
});

describe('the reports, from the real data', () => {
  const counties = data('counties.json');
  const districts = data('districts.json');
  const outcomes = data('outcomes.json');
  const settlements = data('settlements.json');

  for (const lang of ['hu', 'en'] as Lang[]) {
    it(`county (${lang}): every section, no placeholder left, no "undefined"`, () => {
      const r = countyReport(ctx('county', lang), { counties, outcomes, districts, name: 'Veszprém' });
      expect(r.sections.map((s) => s.id)).toEqual(SECTIONS.county);
      const all = texts(r).join('\n');
      expect(all).not.toMatch(/\{\w+\}|undefined|NaN|pdf\./);
    });

    it(`district (${lang}): every section that has data`, () => {
      const r = districtReport(ctx('district', lang), { districts, outcomes, name: 'Ajkai' });
      expect(r.sections.map((s) => s.id)).toEqual(SECTIONS.district);
      expect(texts(r).join('\n')).not.toMatch(/\{\w+\}|undefined|NaN|pdf\./);
    });

    it(`settlement (${lang}): the page's own profile`, () => {
      const profile = settlements.settlements.find((p: SettlementProfile) => p.slug === 'papa');
      const r = settlementReport(ctx('settlement', lang), { profile, dataMonth: settlements.dataMonth,
        national: settlements.national });
      expect(r.sections.map((s) => s.id)).toEqual(SECTIONS.settlement);
      expect(texts(r).join('\n')).not.toMatch(/\{\w+\}|undefined|NaN|pdf\./);
    });
  }

  it('writes a Budapest kerület without the rural ranking it is not part of', () => {
    const kerulet = districts.districts.find((d: { isCapital: boolean }) => d.isCapital).name;
    const r = districtReport(ctx('district', 'hu'), { districts, outcomes, name: kerulet });
    expect(r.title).toBe(kerulet);
    expect(texts(r).join('\n')).not.toMatch(/\{\w+\}|undefined|NaN/);
  });

  it('keeps only the chosen branch and sections', () => {
    const r = countyReport(ctx('county', 'hu', { branch: 'dental', sections: ['summary', 'ranking'], notes: false }),
      { counties, outcomes, districts, name: 'Baranya' });
    // the data month closes every report, notes or not
    expect(r.sections.map((s) => s.id)).toEqual(['summary', 'ranking', 'notes']);
    expect(r.sections[2].blocks).toEqual([{ kind: 'highlight', text: expect.stringContaining('2026. október') }]);
    const all = texts(r).join('\n');
    expect(all).toContain('Fogorvosi körzetek');
    expect(all).not.toContain('Háziorvosi körzetek');
  });

  it('counts the dental districts the way their rate does: vacant and dissolved together', () => {
    const v = counties.counties.find((x: { name: string }) => x.name === 'Veszprém').dentalDistricts;
    const r = countyReport(ctx('county', 'hu', { branch: 'dental', sections: ['summary'], notes: false }),
      { counties, outcomes, districts, name: 'Veszprém' });
    const text = (r.sections[0].blocks[1] as { text: string }).text;
    expect(text).toContain(`szerződésű ${v.vacant + v.dissolved} (`);
    const facts = r.sections[0].blocks.find((b) => b.kind === 'facts');
    expect(facts && facts.kind === 'facts' && facts.rows).toContainEqual(['Betöltetlen fogorvosi körzet', String(v.vacant)]);
  });

  it('draws the county on the map and opens the summary with the two cards', () => {
    const geo = data('geo/counties.geojson').features.map((f: { properties: { name: string };
      geometry: { type: string; coordinates: unknown } }) => ({ name: f.properties.name,
      rings: rings(f.geometry), isCapital: false }));
    const r = countyReport(ctx('county', 'hu'), { counties, outcomes, districts, name: 'Veszprém', geo });
    expect(r.map?.svg).toContain('Veszprém');
    const summary = r.sections[0].blocks;
    const cards = summary.find((b) => b.kind === 'cards');
    expect(cards && cards.kind === 'cards' && cards.cards.map((x) => x.label)).toEqual([
      'településen nincs szerződött háziorvos', 'betöltetlen fogorvosi körzet a megyében lévőkből']);
    // the cards come before the table, as on the page
    expect(summary.findIndex((b) => b.kind === 'cards')).toBeLessThan(summary.findIndex((b) => b.kind === 'facts'));
  });

  it('never writes "vármegye"', () => {
    const r = countyReport(ctx('county', 'hu'), { counties, outcomes, districts, name: 'Baranya' });
    expect(texts(r).join('\n')).not.toMatch(/vármegy/i);
  });

  it('cuts the settlement list to the chosen length', () => {
    const r = countyReport(ctx('county', 'hu', { sections: ['settlements'], settlementLimit: 25, notes: false }),
      { counties, outcomes, districts, name: 'Baranya' });
    const table = r.sections[0].blocks.find((b) => b.kind === 'table');
    expect(table && table.kind === 'table' && table.rows.length).toBe(25);
    expect(r.sections.at(-1)?.id).toBe('notes');
  });

  it('never puts a doctor on a vacant district', () => {
    for (const profile of settlements.settlements.slice(0, 400) as SettlementProfile[]) {
      const r = settlementReport(ctx('settlement', 'hu', { sections: ['care'], notes: false }),
        { profile, dataMonth: settlements.dataMonth });
      const vacantTable = r.sections[0].blocks.filter((b) => b.kind === 'table')
        .find((b) => b.kind === 'table' && b.head.includes('Ellátandó lakos'));
      if (vacantTable && vacantTable.kind === 'table') {
        expect(vacantTable.head).not.toContain('Orvos (NEAK)');
      }
    }
  });
});
