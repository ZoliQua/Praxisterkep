// The little county map on a settlement's page: where this place is, and
// where the care it does not have itself actually stands.
//
// Written as inline SVG rather than a map component, because these 3177 pages
// carry no JavaScript at all — they have to be readable with the network off
// and fast on a phone. Everything on it comes from files the pipeline already
// produces: the county outline, the county seat and the larger towns, this
// settlement's own centre point, and the nearest surgery, on-call point,
// hospital and pharmacy with the driving minutes the road graph measured.
//
// What it deliberately does not do: draw a route. The line is a connection,
// not a road, and the label says minutes so nobody reads distance off it.

const W = 640;
const MAX_H = 460;
const PAD = 14;

/** Layers drawn as a connection, in the order they are stacked. */
export const LINKS = [
  { key: 'gp', label: 'Háziorvos', color: '#4fd6c2' },
  { key: 'dental', label: 'Fogorvos', color: '#8ab4ff' },
  { key: 'oncall', label: 'Központi ügyelet', color: '#f0b429' },
  { key: 'inpatient', label: 'Kórház', color: '#ef6461' },
  { key: 'pharmacy', label: 'Gyógyszertár', color: '#c88ff0' },
];

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const minutes = (n) => `${n.toFixed(n < 10 ? 1 : 0).replace('.', ',')} perc`;

/** Equirectangular projection; at this scale nothing better is warranted. */
function projector(bbox) {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const k = Math.cos(((minLat + maxLat) / 2) * Math.PI / 180);
  const w = (maxLon - minLon) * k;
  const h = maxLat - minLat;
  const scale = Math.min((W - 2 * PAD) / w, (MAX_H - 2 * PAD) / h);
  const height = Math.round(h * scale + 2 * PAD);
  const offX = (W - w * scale) / 2;
  const offY = (height - h * scale) / 2;
  return {
    height,
    xy: ([lon, lat]) => [
      offX + (lon - minLon) * k * scale,
      offY + (maxLat - lat) * scale,
    ],
  };
}

function grow(bbox, [lon, lat]) {
  return [Math.min(bbox[0], lon), Math.min(bbox[1], lat),
    Math.max(bbox[2], lon), Math.max(bbox[3], lat)];
}

function bboxOf(polygon) {
  let box = [Infinity, Infinity, -Infinity, -Infinity];
  for (const ring of polygon) for (const p of ring) box = grow(box, p);
  return box;
}

/**
 * Keeps labels from landing on top of each other.
 *
 * Nothing here is clever: labels are placed in order of importance, each one
 * is pushed down until it no longer overlaps anything already placed, and a
 * label that cannot find room within a few steps is dropped. On a map this
 * small that beats any layout that sometimes prints two names in one place.
 */
function labeller() {
  const taken = [];
  const H = 13;
  return {
    /** Dots are obstacles too: a label must not be printed across one. */
    block(x, y, r) {
      taken.push([x - r, y - r, x + r, y + r]);
    },
    place(x, y, width, { push = 4, side = 'auto' } = {}) {
      const anchorEnd = side === 'end' || (side === 'auto' && x > W * 0.72);
      const x0 = anchorEnd ? x - width : x;
      for (let i = 0; i <= push; i += 1) {
        for (const dir of [1, -1]) {
          const ty = y + dir * i * H;
          const box = [x0, ty - H * 0.8, x0 + width, ty + H * 0.3];
          const clash = taken.some((b) => !(box[2] < b[0] || box[0] > b[2]
            || box[3] < b[1] || box[1] > b[3]));
          if (!clash && ty > 10 && ty < 10000) {
            taken.push(box);
            return { y: ty, anchorEnd };
          }
          if (i === 0) break;
        }
      }
      return null;
    },
  };
}

function pad(box, share = 0.06) {
  const dx = (box[2] - box[0]) * share;
  const dy = (box[3] - box[1]) * share;
  return [box[0] - dx, box[1] - dy, box[2] + dx, box[3] + dy];
}

/**
 * geo: { counties, cities, settlements } — the GeoJSON files the build
 * already copies into public/data.
 */
export function countyMap(profile, geo) {
  const county = geo.counties.features.find((f) => f.properties.name === profile.county);
  if (!county) return '';

  const here = geo.byKsh.get(profile.kshId);
  if (!here) return '';

  // every target that is not in this settlement already: those are the lines
  const targets = [];
  for (const link of LINKS) {
    const t = (profile.travel ?? {})[link.key];
    if (!t || t.minutes === null || t.minutes === undefined) continue;
    if (!t.at || t.at === profile.settlement) continue;
    const point = geo.byName.get(t.at) ?? geo.byName.get(`${t.at}|${profile.county}`);
    if (!point) continue;
    targets.push({ ...link, at: t.at, minutes: t.minutes, coords: point });
  }

  let box = bboxOf(county.geometry.coordinates);
  box = grow(box, here);
  for (const t of targets) box = grow(box, t.coords);
  const { height, xy } = projector(pad(box));

  const path = county.geometry.coordinates
    .map((ring) => `M${ring.map((p) => xy(p).map((v) => v.toFixed(1)).join(' ')).join('L')}Z`)
    .join('');

  // the county seat and the larger towns, for orientation only
  const towns = geo.cities.features
    .filter((f) => f.properties.rank === 'seat' || f.properties.big)
    .map((f) => ({ ...f.properties, coords: f.geometry.coordinates }))
    .filter((c) => c.coords[0] >= box[0] && c.coords[0] <= box[2]
      && c.coords[1] >= box[1] && c.coords[1] <= box[3])
    .filter((c) => c.name !== profile.settlement)
    .sort((a, b) => (b.rank === 'seat') - (a.rank === 'seat') || b.population - a.population)
    .slice(0, 12);

  const [hx, hy] = xy(here);
  const labels = labeller();
  // reserve the dots before any label is placed
  labels.block(hx, hy, 11);
  for (const t of targets) {
    const [tx, ty] = xy(t.coords);
    labels.block(tx, ty, 5);
  }
  for (const c of towns) {
    const [x, y] = xy(c.coords);
    labels.block(x, y, 4);
  }
  // this settlement's own name is placed first: it is why the map exists
  const mine = labels.place(hx + 13, hy + 4.5, profile.settlement.length * 7.4 + 6);

  // several kinds of care often stand in the same town; one label listing
  // them beats three stacked lines that each repeat the name
  const byTown = new Map();
  for (const t of targets) {
    if (!byTown.has(t.at)) byTown.set(t.at, []);
    byTown.get(t.at).push(t);
  }

  const lines = [...byTown.entries()].map(([at, group]) => {
    const [tx, ty] = xy(group[0].coords);
    const text = group.length === 1
      ? `${at} · ${group[0].label.toLowerCase()} ${minutes(group[0].minutes)}`
      : `${at} · ${group.map((g) => `${g.label.toLowerCase()} ${minutes(g.minutes)}`)
        .join(' · ')}`;
    const spot = labels.place(tx + 7, ty + 4, text.length * 5.6);
    const strokes = group.map((t, i) => `
    <line x1="${hx.toFixed(1)}" y1="${hy.toFixed(1)}" x2="${tx.toFixed(1)}"
      y2="${ty.toFixed(1)}" stroke="${t.color}" stroke-width="1.6"
      stroke-dasharray="4 3" stroke-dashoffset="${i * 3}" opacity="0.75"/>`).join('');
    const dots = group.map((t, i) => `
    <circle cx="${(tx + (i - (group.length - 1) / 2) * 5).toFixed(1)}"
      cy="${ty.toFixed(1)}" r="3.6" fill="${t.color}"/>`).join('');
    return `<g class="cm-link">${strokes}${dots}${spot ? `
    <text x="${(spot.anchorEnd ? tx - 9 : tx + 9).toFixed(1)}" y="${spot.y.toFixed(1)}"
      ${spot.anchorEnd ? 'text-anchor="end" ' : ''}fill="#cbd5e1"
      font-size="11">${esc(text)}</text>` : ''}
  </g>`;
  }).join('\n  ');

  const townDots = towns.map((c) => {
    const [x, y] = xy(c.coords);
    const seat = c.rank === 'seat';
    const spot = labels.place(x + 6, y + 3.5, c.name.length * (seat ? 6.2 : 5.4),
      { push: 2 });
    return `<g class="cm-town">
    <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${seat ? 3.4 : 2.2}"
      fill="${seat ? '#94a3b8' : '#64748b'}"/>${spot ? `
    <text x="${(spot.anchorEnd ? x - 6 : x + 6).toFixed(1)}" y="${spot.y.toFixed(1)}"
      ${spot.anchorEnd ? 'text-anchor="end" ' : ''}font-size="${seat ? 11.5 : 10}"
      fill="${seat ? '#cbd5e1' : '#94a3b8'}"${seat ? ' font-weight="600"' : ''}
      >${esc(c.name)}</text>` : ''}
  </g>`;
  }).join('\n  ');

  const legend = targets.length
    ? `<p class="tp-maplegend">${targets.map((t) =>
      `<span><i style="background:${t.color}"></i>${esc(t.label)}</span>`).join('')}</p>`
    : '';

  const inPlace = LINKS
    .filter((l) => {
      const t = (profile.travel ?? {})[l.key];
      return t && t.at === profile.settlement;
    })
    .map((l) => l.label);

  return `<figure class="tp-map">
  <svg viewBox="0 0 ${W} ${height}" width="100%" height="auto" role="img"
    aria-label="${esc(profile.settlement)} elhelyezkedése ${esc(profile.county)} megyében">
    <path d="${path}" fill="#131d2b" stroke="#2a3b52" stroke-width="1.2"/>
    ${townDots}
    ${lines}
    <circle cx="${hx.toFixed(1)}" cy="${hy.toFixed(1)}" r="10" fill="none"
      stroke="#f8fafc" stroke-width="1" opacity="0.5"/>
    <circle cx="${hx.toFixed(1)}" cy="${hy.toFixed(1)}" r="5.5" fill="#f8fafc"/>
    <text x="${(mine?.anchorEnd ? hx - 13 : hx + 13).toFixed(1)}"
      y="${(mine?.y ?? hy + 4.5).toFixed(1)}"${mine?.anchorEnd ? ' text-anchor="end"' : ''}
      font-size="13.5" font-weight="700" fill="#f8fafc">${esc(profile.settlement)}</text>
  </svg>
  ${legend}
  <figcaption>${esc(profile.county)} megye. A szaggatott vonal nem útvonal, hanem
    kapcsolat: a felirat a közúton számított menetidőt mondja.${
  inPlace.length ? ` Helyben van: ${esc(inPlace.join(', '))}.` : ''}</figcaption>
</figure>`;
}
