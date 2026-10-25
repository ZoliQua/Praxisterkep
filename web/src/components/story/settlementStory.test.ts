// The story of the static settlement pages (scripts/settlement-story.mjs),
// built from the real data/settlements.json the way settlement-pages.mjs
// builds it: every line filled in and short enough for the torn note, every
// number the one in the profile, no physician's name, and vacant never
// written as unserved.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import hu from '../../i18n/hu.json';
import en from '../../i18n/en.json';
import { MAX_SCENES, monthsBetween, settlementStory } from '../../../scripts/settlement-story.mjs';
import { formatter, toScenes, type StoryData } from './staticStory';

const FILE = resolve(__dirname, '../../../../data/settlements.json');
type Dict = Record<string, unknown>;
const pick = (root: unknown, key: string): unknown => key.split('.').reduce<unknown>((o, k) => (o as Dict | undefined)?.[k], root);
const fill = (text: string, vars: Record<string, string | number>) =>
  Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, String(v)), text);

// the generator's S() and label(), for one language
function ctx(lang: 'hu' | 'en', data: { dataMonth: string; national?: { age?: unknown } }) {
  const dict = (lang === 'en' ? en : hu) as unknown as Dict;
  const t = (key: string, vars: Record<string, string | number> = {}) =>
    fill(String(pick(dict.static, key) ?? pick((hu as unknown as Dict).static, key) ?? key), vars);
  const label = (key: string) => String(pick(dict, key) ?? pick(hu, key) ?? key);
  return { lang, t, label, months: (dict.static as Dict).months as string[], dataMonth: data.dataMonth, nationalAge: data.national?.age };
}

interface Built { locale: string; title: string; ui: Record<string, string>; scenes: { say: string; mood?: string; pic: { t: string } & Dict }[] }

/** every `doctor` string anywhere in the profile */
function doctorNames(o: unknown, out: string[] = []): string[] {
  if (Array.isArray(o)) o.forEach((x) => doctorNames(x, out));
  else if (o && typeof o === 'object') {
    for (const [k, v] of Object.entries(o)) {
      if (k === 'doctor' && typeof v === 'string' && v.trim()) out.push(v.trim());
      else doctorNames(v, out);
    }
  }
  return out;
}

function sane(story: Built, profile: Dict, lang: string) {
  expect(story.scenes.length).toBeLessThanOrEqual(MAX_SCENES);
  const json = JSON.stringify(story);
  for (const s of story.scenes) {
    expect(s.say).not.toMatch(/[{}]|NaN|undefined|null|story\.|static\./);
    expect(s.say.length).toBeLessThanOrEqual(125);
    expect(s.say).not.toMatch(/vármegye/i);
  }
  for (const name of doctorNames(profile)) expect(json).not.toContain(name);
  // "ellátatlan" / "unserved" only in the caveat that says vacant is not that
  const caveat = lang === 'en' ? en.static.page.vacantNote : hu.static.page.vacantNote;
  for (const s of story.scenes) {
    if (s.say !== caveat) expect(s.say).not.toMatch(/ellátatlan|unserved/i);
  }
  // any scene that shows a vacancy brings the caveat with it
  const vacant = ['gp', 'dental'].reduce((a, k) => a + (((profile[k] as Dict | undefined)?.vacant as number) ?? 0), 0);
  if (vacant > 0) {
    expect(story.scenes.map((s) => s.say)).toContain(caveat);
  }
}

describe.runIf(existsSync(FILE))('settlement stories', () => {
  const data = JSON.parse(readFileSync(FILE, 'utf8'));
  const bySlug = new Map<string, Dict>(data.settlements.map((s: Dict) => [s.slug as string, s]));
  const build = (slug: string, lang: 'hu' | 'en'): Built => settlementStory(bySlug.get(slug), ctx(lang, data));
  const nf = (lang: string) => new Intl.NumberFormat(lang === 'en' ? 'en-GB' : 'hu-HU');

  it('every settlement, both languages', () => {
    for (const p of data.settlements) {
      for (const lang of ['hu', 'en'] as const) {
        const story = settlementStory(p, ctx(lang, data)) as Built;
        expect(story.scenes.length, p.slug).toBeGreaterThanOrEqual(3);
        sane(story, p, lang);
      }
    }
  });

  it('Pécs: the numbers are the profile\'s', () => {
    const p = bySlug.get('pecs') as Dict & { population: number; gp: { filled: number; vacant: number }; index: { rank: number; of: number } };
    const s = build('pecs', 'hu');
    const intro = s.scenes[0];
    expect(intro.say).toContain(nf('hu').format(p.population));
    expect(intro.say).toContain('Baranya megye');
    expect(intro.pic).toMatchObject({ t: 'big', v: p.population });
    const gp = s.scenes.find((x) => x.say.includes('háziorvosi körzetek'))!;
    expect(gp.say).toContain(`${p.gp.filled} betöltött, ${p.gp.vacant} betöltetlen vagy megszűnt`);
    // more than 48 districts: a waffle of the same two counts
    expect(gp.pic).toMatchObject({ t: 'waffle', total: p.gp.filled + p.gp.vacant });
    const ix = s.scenes.find((x) => x.say.startsWith('Összetett'));
    if (ix) expect(ix.say).toContain(`${nf('hu').format(p.index.rank)} / ${nf('hu').format(p.index.of)}`);
  });

  it('Debréte, a village of 13: vacancy, its age and the caveat', () => {
    const p = bySlug.get('debrete') as Dict & {
      vacant: { since: string; kind: string }[]; age: { censusOld: number; censusTotal: number };
      travel: Record<string, { minutes: number; at: string }>; transit: { departures: number };
    };
    for (const lang of ['hu', 'en'] as const) {
      const s = build('debrete', lang);
      const says = s.scenes.map((x) => x.say);
      expect(says).toContain(lang === 'en' ? en.static.page.vacantNote : hu.static.page.vacantNote);
      const houses = s.scenes.find((x) => x.pic.t === 'houses' && (x.pic.tones as string[]).includes('alert'))!;
      expect((houses.pic.tones as string[]).filter((c) => c === 'alert').length).toBe(1);
      const longest = s.scenes.find((x) => x.pic.t === 'bars' && (x.pic.items as { tone: string }[])[0].tone === 'alert')!;
      const since = p.vacant[0].since;
      expect((longest.pic.items as { value: number }[])[0].value).toBeCloseTo(monthsBetween(since, data.dataMonth) / 12, 6);
      const [y, m] = since.split('-').map(Number);
      expect(longest.say).toContain(lang === 'en' ? `${en.static.months[m - 1]} ${y}` : `${y}. ${hu.static.months[m - 1]}`);
    }
    const s = build('debrete', 'hu');
    const age = s.scenes.find((x) => x.say.startsWith('A népszámláláskor'))!;
    expect(age.say).toContain(`65 év feletti ${(100 * p.age.censusOld / p.age.censusTotal).toFixed(1).replace('.', ',')}%`);
    const travel = s.scenes.find((x) => x.say.startsWith('Autóval'))!;
    expect(travel.say).toContain(`kórház ${String(p.travel.inpatient.minutes).replace('.', ',')} perc`);
    const bus = s.scenes.find((x) => x.say.startsWith('Egy átlagos szerdán'))!;
    expect(bus.pic).toMatchObject({ t: 'big', v: p.transit.departures });
  });

  it('a Budapest kerület: no county, no bus, no capital-wide income', () => {
    const s = build('budapest-08-ker', 'hu');
    const says = s.scenes.map((x) => x.say);
    expect(says[0]).toContain('a főváros egyik kerülete');
    expect(says.join(' ')).not.toMatch(/Budapest megye|buszindulás|Jövedelem/);
    const en8 = build('budapest-08-ker', 'en');
    expect(en8.scenes[0].say).toContain("one of the capital's districts");
  });

  it('the player turns every spec into a scene', () => {
    const s = build('pecs', 'en') as unknown as StoryData;
    const scenes = toScenes(s);
    expect(scenes.map((x) => x.say)).toEqual(s.scenes.map((x) => x.say));
    for (const sc of scenes) expect(typeof sc.draw).toBe('function');
  });
});

describe('the pictures\' number formats', () => {
  it('follow the page language', () => {
    expect(formatter('hu-HU', { d: 1, suffix: ' perc' })(9.14)).toBe('9,1 perc');
    expect(formatter('en-GB', { d: 1, suffix: ' min' })(9.14)).toBe('9.1 min');
    expect(formatter('hu-HU', { d: 1, zero: 'helyben' })(0)).toBe('helyben');
    expect(formatter('hu-HU', { pct: true })(0.25)).toBe('25%');
  });
});
