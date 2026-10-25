// The animated story of one settlement page: about thirty seconds, one
// handwritten line per scene, built from the settlement's own profile in
// data/settlements.json — the same numbers the page prints further down.
// settlement-pages.mjs writes what this returns into the page as JSON, and
// src/components/story/staticStory.ts plays it on the canvas engine the app's
// stories use. A scene whose data the profile lacks (many small villages
// have no census split, no bus, no pharmacy) is left out, never guessed.
//
// Rules that hold for every line:
// - every word comes from i18n: the static.story block (and a few existing
//   static.* strings) through `t`, the player's buttons from story.ui
//   through `label`;
// - a Hungarian case ending is never glued to a number — the sentences are
//   worded around the numbers instead;
// - vacant (betöltetlen) is never written as unserved (ellátatlan), and the
//   caveat follows any scene that shows a vacancy;
// - no physician's name: the profile carries the names of filled districts'
//   doctors, and this module reads none of those fields.

/** Scenes a story may hold; past this the least important ones go. */
export const MAX_SCENES = 9;

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** whole months from 'YYYY-MM' to 'YYYY-MM' */
export function monthsBetween(from, to) {
  const [y1, m1] = from.split('-').map(Number);
  const [y2, m2] = to.split('-').map(Number);
  return (y2 - y1) * 12 + (m2 - m1);
}

/**
 * @param {object} profile one entry of settlements.json's `settlements`
 * @param {object} o
 * @param {'hu'|'en'} o.lang
 * @param {(key: string, vars?: object) => string} o.t a static.* string, placeholders filled
 * @param {(key: string) => string} o.label any other i18n string, unfilled
 * @param {string[]} o.months the twelve month names of the language
 * @param {string} o.dataMonth 'YYYY-MM', the month of the data
 * @param {object} [o.nationalAge] settlements.json's national.age
 */
export function settlementStory(profile, { lang, t, label, months, dataMonth, nationalAge }) {
  const locale = lang === 'en' ? 'en-GB' : 'hu-HU';
  const sep = lang === 'en' ? '.' : ',';
  const nf = new Intl.NumberFormat(locale);
  const num = (v) => nf.format(Math.round(v));
  const pct = (r) => `${(r * 100).toFixed(1).replace('.', sep)}%`;
  const dec = (v, d) => v.toFixed(d).replace('.', sep);
  const unitMin = t('unit.min');
  const minutes = (m) => `${String(m).replace('.', sep)} ${unitMin}`;
  const monthLabel = (ym) => {
    const [y, m] = ym.split('-').map(Number);
    return lang === 'en' ? `${months[m - 1]} ${y}` : `${y}. ${months[m - 1]}`;
  };
  const k = (key, vars) => t(`story.${key}`, vars);
  const fill = (s, v) => s.replace(/\{(\w+)\}/g, (m, key) => (key in v ? String(v[key]) : m));

  const name = profile.settlement;
  const capital = profile.county === 'Budapest';
  /** [priority, scene] — the higher, the longer it survives the cut */
  const all = [];
  const add = (prio, scene) => all.push([prio, scene]);

  // 1. who and where
  if (isNum(profile.population) && profile.population > 0) {
    const district = profile.district && profile.district !== name ? profile.district : '';
    const say = capital ? k('introCapital', { name, pop: num(profile.population) })
      : district ? k('intro', { name, pop: num(profile.population), county: profile.county, district })
        : k('introCounty', { name, pop: num(profile.population), county: profile.county });
    add(10, { say, pic: { t: 'big', v: profile.population, label: k('residents'), tone: 'accent' } });
  }

  // 2. the age composition of the census
  const a = profile.age;
  if (a && isNum(a.censusTotal) && a.censusTotal > 0
      && isNum(a.censusYoung) && isNum(a.censusWorking) && isNum(a.censusOld)) {
    const tot = a.censusTotal;
    const nat = nationalAge && nationalAge.total > 0 ? nationalAge.old / nationalAge.total : null;
    const old = a.censusOld / tot;
    if (nat !== null) {
      add(8, {
        say: k('age', { young: pct(a.censusYoung / tot), working: pct(a.censusWorking / tot), old: pct(old), national: pct(nat) }),
        mood: old > nat ? 'surprised' : 'happy',
        pic: { t: 'waffle', total: a.censusYoung + a.censusWorking + a.censusOld, parts: [
          { n: a.censusYoung, tone: 's2', label: t('age.young') },
          { n: a.censusWorking, tone: 'accent', label: t('age.working') },
          { n: a.censusOld, tone: 'soft', label: t('age.old') },
        ] },
      });
    }
  }

  // 3. the districts that serve it, per branch
  let vacancyShown = false;
  for (const kind of ['gp', 'dental']) {
    const b = profile[kind];
    const mascot = kind === 'gp' ? 'house' : 'tooth';
    const adj = t(kind === 'gp' ? 'branch.gpAdj' : 'branch.dentalAdj');
    if (!b) continue;
    const filled = isNum(b.filled) ? b.filled : 0;
    const vacant = isNum(b.vacant) ? b.vacant : 0;
    const total = filled + vacant;
    if (total > 0) {
      const key = vacant === 0 ? 'districtsAllFilled' : filled === 0 ? 'districtsNoneFilled' : 'districts';
      const tones = [...Array(filled).fill(kind), ...Array(vacant).fill('alert')];
      add(kind === 'gp' ? 10 : 9, {
        say: k(key, { kind: adj, filled: num(filled), vacant: num(vacant) }),
        mascot, mood: vacant ? 'worried' : 'happy',
        pic: total <= 48 ? { t: 'houses', tones } : { t: 'waffle', total, parts: [
          { n: filled, tone: kind, label: k('filled') },
          { n: vacant, tone: 'alert', label: k('vacant') },
        ] },
      });
      if (vacant) vacancyShown = true;
    } else if (kind === 'dental' && b.state === 'absent') {
      // the dental lists do not name every settlement they serve: the nearest
      // surgery by road is the honest answer, as on the page itself
      const d = profile.travel?.dental;
      if (d && isNum(d.minutes) && d.at && d.at !== name) {
        add(6, {
          say: k('dentalAbsent', { where: d.at, min: minutes(d.minutes) }), mascot,
          pic: { t: 'big', v: d.minutes, fmt: { d: 1, suffix: ` ${unitMin}` }, label: k('dentalAbsentLabel'), tone: 'dental' },
        });
      }
    }
  }

  // 4. how long the oldest vacancy has lasted
  const open = (profile.vacant ?? [])
    .filter((v) => v.status !== 'dissolved' && /^\d{4}-\d{2}$/.test(v.since ?? '') && monthsBetween(v.since, dataMonth) >= 0)
    .sort((x, y) => x.since.localeCompare(y.since));
  if (open.length) {
    const first = open[0];
    const adj = t(first.kind === 'gp' ? 'branch.gpAdj' : 'branch.dentalAdj');
    add(8, {
      say: open.length === 1 ? k('longestOne', { kind: adj, since: monthLabel(first.since) })
        : k('longest', { since: monthLabel(first.since) }),
      mascot: first.kind === 'gp' ? 'house' : 'tooth', mood: 'worried',
      pic: { t: 'bars', fmt: { d: 1, suffix: ` ${k('yearsUnit')}` }, items: open.slice(0, 5).map((v) => ({
        label: `${k(`short.${v.kind}`)} · ${t(`type.${v.type}`)}`,
        value: monthsBetween(v.since, dataMonth) / 12,
        tone: 'alert',
      })) },
    });
    vacancyShown = true;
  }

  // 5. vacant is not unserved: said wherever a vacancy was shown
  if (vacancyShown) {
    const filled = (profile.gp?.filled ?? 0) + (profile.dental?.filled ?? 0);
    const vacant = (profile.gp?.vacant ?? 0) + (profile.dental?.vacant ?? 0);
    const share = filled + vacant > 0 ? vacant / (filled + vacant) : 0;
    const lit = Math.round(Math.min(1, Math.max(0, share)) * 40);
    add(9, {
      say: t('page.vacantNote'), mood: 'proud',
      pic: { t: 'houses', tones: Array.from({ length: 40 }, (_, i) =>
        (Math.floor(((i + 1) * lit) / 40) > Math.floor((i * lit) / 40) ? 'soft' : 'accent')) },
    });
  }

  // 6. by car
  const tr = profile.travel ?? {};
  const legs = ['gp', 'dental', 'oncall', 'inpatient'];
  if (legs.every((l) => tr[l] && isNum(tr[l].minutes))) {
    const here = (l) => tr[l].at === name || tr[l].minutes === 0;
    const tones = { gp: 'gp', dental: 'dental', oncall: 's3', inpatient: 's5' };
    // four bars of nothing say less than the one sentence
    if (legs.every(here)) {
      add(8, { say: k('travelAllHere'), mood: 'proud', pic: { t: 'houses', tones: legs.map((l) => tones[l]) } });
    } else add(8, {
      say: k('travel', Object.fromEntries(legs.map((l) => [l, here(l) ? t('here') : minutes(tr[l].minutes)]))),
      mood: !here('gp') && tr.gp.minutes > 15 ? 'worried' : 'happy',
      pic: { t: 'bars', fmt: { d: 1, suffix: ` ${unitMin}`, zero: t('here') }, items: legs.map((l) => ({
        label: k(`care.${l}`), value: here(l) ? 0 : tr[l].minutes, tone: tones[l] })) },
    });
  }

  // 7. by bus (Budapest has its own timetable source, not in the data)
  const bus = profile.transit;
  if (bus && isNum(bus.departures)) {
    const gpHere = tr.gp && (tr.gp.at === name || tr.gp.minutes === 0);
    let say;
    if (bus.departures === 0) say = k('busNone');
    else if (bus.gp && bus.gp.direct === false && !gpHere) say = k('busNoGp', { dep: num(bus.departures) });
    else if (isNum(bus.reachable)) say = k('bus', { dep: num(bus.departures), reach: num(bus.reachable) });
    if (say) {
      add(6, {
        say, mood: bus.departures === 0 || bus.gp?.direct === false ? 'worried' : 'happy',
        pic: { t: 'big', v: bus.departures, label: k('busLabel'), tone: 's2' },
      });
    }
  }

  // 8. pharmacies
  const ph = profile.pharmacies ?? [];
  if (ph.length) {
    add(4, { say: k('pharmacyHere', { n: num(ph.length) }), pic: { t: 'big', v: ph.length, label: k('pharmacyLabel'), tone: 'accent' } });
  } else if (tr.pharmacy && isNum(tr.pharmacy.minutes) && tr.pharmacy.at && tr.pharmacy.at !== name) {
    add(4, {
      say: k('pharmacyNone', { where: tr.pharmacy.at, min: minutes(tr.pharmacy.minutes) }), mood: 'worried',
      pic: { t: 'big', v: tr.pharmacy.minutes, fmt: { d: 1, suffix: ` ${unitMin}` }, label: k('pharmacyNoneLabel'), tone: 'soft' },
    });
  }

  // 9. the composite index
  const ix = profile.index;
  if (ix && isNum(ix.value) && isNum(ix.rank) && isNum(ix.of) && ix.band) {
    const bandTone = { kiemelt: 'alert', magas: 'soft', kozepes: 's2', alacsony: 'accent' }[ix.band] ?? 'accent';
    add(7, {
      say: k('index', { value: dec(ix.value, 1), band: t(`band.${ix.band}`), rank: num(ix.rank), of: num(ix.of) }),
      mood: ix.band === 'kiemelt' || ix.band === 'magas' ? 'worried' : 'proud',
      pic: { t: 'big', v: ix.value, fmt: { d: 1 }, label: k('indexLabel'), tone: bandTone },
    });
  }

  // 10. a care desert
  const cl = profile.cluster;
  if (cl && cl.name && isNum(cl.settlements) && isNum(cl.population)) {
    add(5, {
      say: k('cluster', { name: cl.name, n: num(cl.settlements), pop: num(cl.population) }), mood: 'worried',
      pic: { t: 'houses', tones: Array(Math.min(48, cl.settlements)).fill('soft') },
    });
  }

  // 11. a year of change: the branch that moved most, or the new doctors
  const ch = profile.change;
  if (ch && /^\d{4}-\d{2}$/.test(ch.month ?? '')) {
    const moved = ['gp', 'dental']
      .map((kind) => ({ kind, c: ch.kinds?.[kind] }))
      .filter((x) => x.c && isNum(x.c.vacant) && isNum(x.c.vacantNow) && x.c.vacant !== x.c.vacantNow)
      .sort((x, y) => Math.abs(y.c.vacantNow - y.c.vacant) - Math.abs(x.c.vacantNow - x.c.vacant));
    if (moved.length) {
      const { kind, c } = moved[0];
      add(5, {
        say: k('change', { month: monthLabel(ch.month), kind: t(kind === 'gp' ? 'branch.gpAdj' : 'branch.dentalAdj'),
          then: num(c.vacant), now: num(c.vacantNow) }),
        mascot: kind === 'gp' ? 'house' : 'tooth', mood: c.vacantNow > c.vacant ? 'worried' : 'proud',
        pic: { t: 'columns', items: [
          { label: monthLabel(ch.month), value: c.vacant, tone: 'track' },
          { label: monthLabel(dataMonth), value: c.vacantNow, tone: c.vacantNow > c.vacant ? 'alert' : kind },
        ] },
      });
    } else if (isNum(ch.newDoctors) && ch.newDoctors > 0) {
      add(5, {
        say: t('change.newDoctors', { n: num(ch.newDoctors) }), mood: 'proud',
        pic: { t: 'big', v: ch.newDoctors, label: k('newDoctorsLabel'), tone: 'accent' },
      });
    }
  }

  // 12. income, held against the járás and the median settlement; the
  // capital's kerület have only the capital's own figure, so not there
  const inc = profile.living?.income;
  if (inc && !profile.living.capitalWide && isNum(inc.value) && isNum(inc.median) && inc.year) {
    const mFt = (v) => `${dec(v / 1000, 2)} ${t('unit.mFt')}`;
    add(3, {
      say: k('income', { year: inc.year, value: mFt(inc.value), median: mFt(inc.median) }),
      mood: inc.value < inc.median ? 'worried' : 'happy',
      pic: { t: 'columns', fmt: { d: 2, suffix: ` ${t('unit.mFt')}` }, items: [
        { label: name, value: inc.value / 1000, tone: inc.value < inc.median ? 'soft' : 'accent' },
        ...(isNum(inc.district) && profile.district && profile.district !== name
          ? [{ label: k('districtCol', { district: profile.district }), value: inc.district / 1000, tone: 's2' }] : []),
        { label: k('medianCol'), value: inc.median / 1000, tone: 'track' },
      ] },
    });
  }

  // the cut: the least important go first, the order of the rest is kept
  let kept = all;
  while (kept.length > MAX_SCENES) {
    const low = Math.min(...kept.map(([p]) => p));
    const idx = kept.map(([p]) => p).lastIndexOf(low);
    kept = kept.filter((_, i) => i !== idx);
  }
  const scenes = kept.map(([, s]) => s);
  const title = k('title', { name });
  const ui = Object.fromEntries(['region', 'aria', 'play', 'pause', 'next', 'replay', 'scene', 'time', 'counter']
    .map((key) => [key, fill(label(`story.ui.${key}`), { title, n: scenes.length })]));
  return { locale, mascot: 'house', title, ui, scenes };
}
