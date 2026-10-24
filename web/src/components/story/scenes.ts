// The recurring pictures of the stories, each a function of the scene's
// time (0 → 1): a number counting up, a waffle of a hundred squares, rows of
// people lighting up, torn-paper bars, two or three columns side by side, a
// line drawing itself, a donut filling, houses, name pins, coins. Numbers the
// pictures write themselves (legends, a donut's middle) go through p.fmt, so
// they follow the host page's locale.
import { Painter, clamp, ease, span } from './paint';

export type Area = { x: number; y: number; w: number; h: number };

/** The headline number of a scene, counting up from zero (or from `from`). */
export function bigNumber(p: Painter, value: number, fmt: (v: number) => string, t: number, o: { x?: number; y?: number; size?: number; color?: string; label?: string; from?: number } = {}) {
  const st = p.stage;
  const size = o.size ?? (p.narrow ? 46 : Math.min(76, st.h * 0.34));
  const x = o.x ?? st.x + st.w / 2;
  const y = o.y ?? st.y + st.h * 0.42;
  const k = ease.out(span(t, 0.05, 0.55));
  const v = (o.from ?? 0) + (value - (o.from ?? 0)) * k;
  p.shadow(true);
  p.text(fmt(v), x, y, { size, kind: 'display', weight: 850, color: o.color ?? p.c.ink, align: 'center' });
  p.shadow(false);
  if (o.label) {
    p.font(Math.max(14, size * 0.24), 'body');
    const lines = p.wrap(o.label, st.w * 0.9);
    lines.forEach((l, i) => p.text(l, x, y + size * 0.5 + i * size * 0.3, { size: Math.max(14, size * 0.24), color: p.c.dim, align: 'center', alpha: span(t, 0.3, 0.6) }));
  }
}

/** A hundred squares; `parts` are counts out of `total`, each painted in its colour, popping in order. */
export function waffle(p: Painter, parts: { n: number; color: string; label: string }[], total: number, t: number, area: Area = p.stage) {
  const cells = 100;
  if (total <= 0) return;
  const shares = parts.map((q) => Math.round((q.n / total) * cells));
  let diff = cells - shares.reduce((a, b) => a + b, 0);
  for (let i = 0; diff !== 0 && i < 200; i++) { const k = i % shares.length; if (diff > 0) { shares[k]++; diff--; } else if (shares[k] > 0) { shares[k]--; diff++; } }
  const side = Math.min(area.h * 0.82, area.w * 0.42);
  const gap = side / 10;
  const x0 = area.x + (p.narrow ? (area.w - side) / 2 : 6);
  const y0 = area.y + (area.h - side) / 2;
  let idx = 0;
  shares.forEach((sh, pi) => {
    for (let i = 0; i < sh; i++, idx++) {
      const appear = span(t, 0.05 + (idx / cells) * 0.5, 0.12 + (idx / cells) * 0.5);
      if (appear <= 0) continue;
      const s = gap * 0.8 * ease.back(appear);
      const cx = x0 + (idx % 10) * gap + gap / 2;
      const cy = y0 + Math.floor(idx / 10) * gap + gap / 2;
      p.paper(cx - s / 2, cy - s / 2, s, s, parts[pi].color, 300 + idx, { amp: 0.6, edge: false });
    }
  });
  if (!p.narrow) {
    parts.forEach((q, i) => {
      const a = span(t, 0.45 + i * 0.1, 0.6 + i * 0.1);
      const ly = y0 + 16 + i * 44;
      p.paper(x0 + side + 28, ly - 13, 18, 18, q.color, 77 + i, { amp: 0.6, alpha: a });
      p.text(p.fmt.num(q.n), x0 + side + 56, ly + 2, { size: 24, weight: 800, kind: 'display', alpha: a });
      p.text(q.label, x0 + side + 56, ly + 21, { size: 14, color: p.c.dim, alpha: a });
    });
  }
}

/** Rows of paper people; the first `lit` of `n` light up in `color` as t runs. */
export function people(p: Painter, n: number, lit: number, t: number, color: string, o: { area?: Area; base?: string; litFrom?: number } = {}) {
  const area = o.area ?? p.stage;
  const cols = p.narrow ? 10 : 20;
  const rows = Math.ceil(n / cols);
  const s = Math.min(area.w / cols, (area.h - 10) / rows) * 0.92;
  const x0 = area.x + (area.w - cols * s) / 2 + s / 2;
  const y0 = area.y + (area.h - rows * s) / 2 + s * 0.9;
  const shown = ease.out(span(t, 0.0, 0.3));
  const litNow = (o.litFrom ?? 0) + (lit - (o.litFrom ?? 0)) * ease.inOut(span(t, 0.3, 0.75));
  for (let i = 0; i < n; i++) {
    const appear = clamp(shown * n - i);
    if (appear <= 0) continue;
    const x = x0 + (i % cols) * s;
    const y = y0 + Math.floor(i / cols) * s;
    const on = i < litNow;
    p.person(x, y, s * 0.9 * (0.6 + 0.4 * appear), on ? color : (o.base ?? p.c.track), 1);
  }
}

/** Torn-paper bars, in the order given; `ref` draws a dashed line. */
export function bars(p: Painter, items: { label: string; value: number; color?: string }[], fmt: (v: number) => string, t: number, o: { area?: Area; ref?: { label: string; value: number }; max?: number } = {}) {
  const area = o.area ?? p.stage;
  if (!items.length) return;
  const labelW = p.narrow ? area.w * 0.36 : Math.min(220, area.w * 0.34);
  const hi = o.max ?? Math.max(...items.map((i) => i.value), o.ref?.value ?? 0, 1e-9);
  const rowH = Math.min(40, area.h / (items.length + (o.ref ? 0.8 : 0.2)));
  const x0 = area.x + labelW + 10;
  const wMax = area.w - labelW - (p.narrow ? 60 : 90);
  const maxChars = p.narrow ? 16 : 24;
  items.forEach((it, i) => {
    const k = ease.out(span(t, 0.08 + i * 0.08, 0.5 + i * 0.08));
    const y = area.y + i * rowH + rowH * 0.15;
    p.bar(x0, y, (it.value / hi) * wMax * k, rowH * 0.66, it.color ?? p.c.accent, 500 + i * 13,
      it.label.length > maxChars ? `${it.label.slice(0, maxChars - 1)}…` : it.label,
      k > 0.05 ? fmt(it.value * k) : undefined);
  });
  if (o.ref) {
    const a = span(t, 0.55, 0.8);
    const x = x0 + (o.ref.value / hi) * wMax;
    p.ctx.save();
    p.ctx.globalAlpha = a;
    p.ctx.strokeStyle = p.c.rule;
    p.ctx.setLineDash([5, 4]);
    p.ctx.lineWidth = 1.5;
    p.ctx.beginPath();
    p.ctx.moveTo(x, area.y);
    p.ctx.lineTo(x, area.y + items.length * rowH + 4);
    p.ctx.stroke();
    p.ctx.restore();
    p.text(`${o.ref.label}: ${fmt(o.ref.value)}`, x, area.y + items.length * rowH + 22, { size: 14, color: p.c.ink, align: 'center', alpha: a });
  }
}

/** Two or three columns side by side, rising. */
export function columns(p: Painter, items: { label: string; value: number; color: string }[], fmt: (v: number) => string, t: number, area: Area = p.stage) {
  if (!items.length) return;
  const hi = Math.max(...items.map((i) => i.value), 1e-9);
  const colW = Math.min(120, area.w / (items.length * 1.8));
  const gap = (area.w - items.length * colW) / (items.length + 1);
  const base = area.y + area.h - 26;
  items.forEach((it, i) => {
    const k = ease.out(span(t, 0.1 + i * 0.12, 0.55 + i * 0.12));
    const h = (it.value / hi) * (area.h - 70) * k;
    const x = area.x + gap + i * (colW + gap);
    p.paper(x, base - h, colW, h, it.color, 700 + i * 31, { amp: 1.8 });
    if (k > 0.05) p.text(fmt(it.value * k), x + colW / 2, base - h - 10, { size: p.narrow ? 18 : 24, weight: 800, kind: 'display', align: 'center' });
    p.text(it.label, x + colW / 2, base + 20, { size: p.narrow ? 12 : 14, color: p.c.dim, align: 'center', alpha: span(t, 0.1, 0.3) });
  });
}

/** A line drawing itself left to right, the first and the last value marked. */
export function line(p: Painter, values: (number | null)[], labels: string[], fmt: (v: number) => string, t: number, color: string, o: { area?: Area; lo?: number; hi?: number; mark?: number } = {}) {
  const area = o.area ?? p.stage;
  const pts = values.map((v, i) => [i, v] as const).filter((q): q is readonly [number, number] => q[1] !== null);
  if (pts.length < 2) return;
  const lo = o.lo ?? Math.min(...pts.map((q) => q[1]));
  const hi = o.hi ?? Math.max(...pts.map((q) => q[1]));
  const pad = (hi - lo) * 0.15 || 1;
  const X = (i: number) => area.x + 20 + (i / (values.length - 1)) * (area.w - 90);
  const Y = (v: number) => area.y + area.h - 30 - ((v - lo + pad) / (hi - lo + 2 * pad)) * (area.h - 50);
  const k = ease.inOut(span(t, 0.05, 0.7));
  const upto = k * (values.length - 1);
  const { ctx } = p;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const path = () => {
    ctx.beginPath();
    let started = false;
    for (const [i, v] of pts) {
      if (i > upto) {
        const prev = pts.filter((q) => q[0] <= upto).at(-1);
        if (prev && started) {
          const f = (upto - prev[0]) / (i - prev[0]);
          ctx.lineTo(X(prev[0] + (i - prev[0]) * f), Y(prev[1] + (v - prev[1]) * f));
        }
        break;
      }
      if (!started) { ctx.moveTo(X(i), Y(v)); started = true; } else ctx.lineTo(X(i), Y(v));
    }
  };
  ctx.strokeStyle = p.c.fibre;
  ctx.lineWidth = 7; path(); ctx.stroke();
  ctx.strokeStyle = color; ctx.lineWidth = 4; path(); ctx.stroke();
  ctx.restore();
  const first = pts[0];
  p.circle(X(first[0]), Y(first[1]), 5, p.c.rule);
  p.text(fmt(first[1]), X(first[0]), Y(first[1]) - 14, { size: 15, weight: 700, align: 'left' });
  p.text(labels[first[0]] ?? '', X(first[0]), area.y + area.h - 6, { size: 13, color: p.c.dim });
  if (k > 0.98) {
    const last = pts[pts.length - 1];
    const a = span(t, 0.7, 0.85);
    p.circle(X(last[0]), Y(last[1]), 6, color, a);
    p.text(fmt(last[1]), X(last[0]) + 10, Y(last[1]) - 12, { size: 18, weight: 800, kind: 'display', alpha: a });
    p.text(labels[last[0]] ?? '', X(last[0]), area.y + area.h - 6, { size: 13, color: p.c.dim, align: 'center', alpha: a });
  }
  if (o.mark !== undefined && o.mark >= 0) {
    const a = span(t, 0.75, 0.9);
    p.ctx.save();
    p.ctx.globalAlpha = a;
    p.ctx.strokeStyle = p.c.soft;
    p.ctx.setLineDash([5, 4]);
    p.ctx.beginPath();
    p.ctx.moveTo(X(o.mark), area.y + 8);
    p.ctx.lineTo(X(o.mark), area.y + area.h - 26);
    p.ctx.stroke();
    p.ctx.restore();
  }
}

/** A donut filling up to `share`, the share written in its middle. */
export function donut(p: Painter, share: number, t: number, color: string, o: { cx?: number; cy?: number; r?: number; label?: string } = {}) {
  const st = p.stage;
  const r = o.r ?? Math.min(st.h * 0.36, st.w * 0.2);
  const cx = o.cx ?? st.x + st.w * (p.narrow ? 0.5 : 0.3);
  const cy = o.cy ?? st.y + st.h * 0.5;
  const k = ease.out(span(t, 0.08, 0.65));
  const { ctx } = p;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineWidth = r * 0.34;
  ctx.strokeStyle = p.c.track;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  if (share * k > 0) {
    ctx.strokeStyle = p.c.fibre;
    ctx.lineWidth = r * 0.34 + 4;
    ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * share * k); ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = r * 0.34;
    ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * share * k); ctx.stroke();
  }
  ctx.restore();
  p.text(p.fmt.pct(share * k), cx, cy + r * 0.18, { size: r * 0.5, weight: 850, kind: 'display', align: 'center' });
  if (o.label && !p.narrow) {
    p.font(20, 'body');
    const lines = p.wrap(o.label, st.w * 0.42);
    lines.forEach((l, i) => p.text(l, cx + r + 40, cy - (lines.length - 1) * 13 + i * 26 + 6, { size: 20, color: p.c.ink, alpha: span(t, 0.4, 0.7) }));
  }
}

/** Houses in a row: `colors` one per house, popping up. */
export function houses(p: Painter, colors: string[], t: number, area: Area = p.stage) {
  const n = colors.length;
  if (!n) return;
  const cols = Math.min(n, p.narrow ? 8 : 16);
  const rows = Math.ceil(n / cols);
  const s = Math.min(area.w / cols, area.h / rows) * 0.86;
  const x0 = area.x + (area.w - cols * s) / 2 + s / 2;
  const y0 = area.y + (area.h - rows * s) / 2 + s * 0.95;
  colors.forEach((c, i) => {
    const k = ease.back(span(t, 0.03 + (i / n) * 0.45, 0.12 + (i / n) * 0.45));
    if (k <= 0) return;
    p.house(x0 + (i % cols) * s, y0 + Math.floor(i / cols) * s, s * 0.9 * k, c, 900 + i);
  });
}

/** `n` houses of which the first `share` are painted `on`, spread evenly through the row. */
export function houseShare(share: number, on: string, off: string, n = 40): string[] {
  const lit = Math.round(clamp(share) * n);
  return Array.from({ length: n }, (_, i) => (Math.floor(((i + 1) * lit) / n) > Math.floor((i * lit) / n) ? on : off));
}

/** Paper name tags pinned to the board, one after another. */
export function pins(p: Painter, names: string[], t: number, color: string, area: Area = p.stage) {
  const per = p.narrow ? 1 : Math.min(3, names.length);
  const w = Math.min(230, area.w / per - 20);
  names.forEach((name, i) => {
    const k = ease.back(span(t, 0.1 + i * 0.15, 0.35 + i * 0.15));
    if (k <= 0) return;
    const col = i % per;
    const row = Math.floor(i / per);
    const x = area.x + col * (w + 20) + (area.w - per * (w + 20)) / 2 + 10;
    const y = area.y + 20 + row * 70;
    p.shadow(true);
    p.paper(x, y, w * k, 50, color, 1200 + i * 17, { rot: (i % 2 ? 1 : -1) * 0.025 });
    p.shadow(false);
    p.circle(x + w / 2, y + 2, 6, '#e0453a', k);
    p.text(name, x + w / 2, y + 33, { size: 22, kind: 'hand', color: '#1b1b2a', align: 'center', onPaper: true, alpha: span(t, 0.2 + i * 0.15, 0.4 + i * 0.15) });
  });
}

/** A stack of coins, as tall as `share` of the tallest. */
export function coinStack(p: Painter, x: number, base: number, share: number, t: number, label: string, value: string, maxH: number) {
  const k = ease.out(span(t, 0.1, 0.65));
  const n = Math.max(1, Math.round(share * k * (maxH / 9)));
  for (let i = 0; i < n; i++) p.coin(x, base - i * 9, 26);
  p.text(value, x, base - n * 9 - 22, { size: p.narrow ? 18 : 24, weight: 800, kind: 'display', align: 'center', alpha: span(t, 0.4, 0.7) });
  p.text(label, x, base + 30, { size: 14, color: p.c.dim, align: 'center' });
}
