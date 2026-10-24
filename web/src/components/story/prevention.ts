// The prevention chain, drawn in cut paper: the same patient (mustard
// sweater) through four scenes when the district has a doctor and four when
// it has none, for a GP district and for a dental one. Every scene is a
// function of its own time t (0 → 1 while it plays in; it stays at 1 after)
// and of the wall clock p.now for the small idle motions. Pure canvas, on the
// shared Painter: no text is drawn here — the step's title and description
// are HTML beside the picture.
import { type Painter, clamp, ease, rng, span } from './paint';

export type Variant = 'ok' | 'broken';
export type Kind = 'gp' | 'dental';
type Face = 'happy' | 'calm' | 'worried' | 'sad';

// the characters keep their own colours in both themes: they are paper
const SKIN = '#e8b48c';
const SKIN_DOC = '#d99a6c';
const HAIR = '#5a4632';
const HAIR_DOC = '#3c434d';
const SWEATER = '#d9a441';
const JEANS = '#46618f';
const INK = '#1b1b2a';
const BLUSH = '#f4a6a6';
const DOOR = '#8a6a4a';
const DARK = '#2a2f45';
const LIGHT = '#ffe39a';
const CAVITY = '#4a3a2a';

/** the unit every scene is measured in, and where the ground is */
function frame(p: Painter) {
  const u = Math.min(p.H / 235, p.W / 600);
  return { u, gy: p.H * 0.9, cx: p.W / 2 };
}

/* ------------------------------------------------------------ pieces */

function face(p: Painter, x: number, y: number, r: number, mood: Face, dir = 1) {
  const { ctx } = p;
  const ex = x + dir * r * 0.18;
  const blink = (p.now % 3700) < 120;
  ctx.save();
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(1.4, r * 0.12);
  for (const s of [-1, 1]) {
    const px = ex + s * r * 0.36;
    if (blink || mood === 'happy') {
      ctx.beginPath();
      if (mood === 'happy' && !blink) ctx.arc(px, y - r * 0.05, r * 0.14, Math.PI * 1.1, Math.PI * 1.9);
      else { ctx.moveTo(px - r * 0.13, y - r * 0.1); ctx.lineTo(px + r * 0.13, y - r * 0.1); }
      ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(px, y - r * 0.1, r * 0.12, 0, Math.PI * 2); ctx.fill();
    }
    if (mood === 'worried' || mood === 'sad') {
      ctx.beginPath();
      ctx.moveTo(px - s * r * 0.2, y - r * 0.42);
      ctx.lineTo(px + s * r * 0.12, y - r * 0.32);
      ctx.stroke();
    }
  }
  ctx.globalAlpha *= 0.8;
  p.circle(ex - r * 0.6, y + r * 0.22, r * 0.14, BLUSH);
  p.circle(ex + r * 0.6, y + r * 0.22, r * 0.14, BLUSH);
  ctx.globalAlpha = 1;
  ctx.beginPath();
  const my = y + r * 0.38;
  if (mood === 'happy') ctx.arc(ex, my - r * 0.12, r * 0.3, Math.PI * 0.15, Math.PI * 0.85);
  else if (mood === 'calm') { ctx.moveTo(ex - r * 0.2, my); ctx.quadraticCurveTo(ex, my + r * 0.12, ex + r * 0.2, my); }
  else if (mood === 'sad') { ctx.moveTo(ex - r * 0.22, my + r * 0.08); ctx.quadraticCurveTo(ex, my - r * 0.14, ex + r * 0.22, my + r * 0.08); }
  else { ctx.moveTo(ex - r * 0.18, my); ctx.lineTo(ex + r * 0.18, my); }
  ctx.stroke();
  ctx.restore();
}

/** a paper person standing at x on the ground: legs, sweater or white coat, arms, head */
function figure(p: Painter, x: number, gy: number, u: number, o: {
  doctor?: boolean; mood: Face; dir?: 1 | -1; wave?: number; seed: number; lift?: number; bob?: number;
}) {
  const { ctx, c } = p;
  const s = u;
  const dir = o.dir ?? 1;
  const body = o.doctor ? c.paper : SWEATER;
  const skin = o.doctor ? SKIN_DOC : SKIN;
  const y = gy - (o.lift ?? 0) - Math.abs(Math.sin((o.bob ?? 0) * Math.PI)) * 4 * s;
  // legs, then the body over them
  p.paper(x - 13 * s, y - 34 * s, 11 * s, 34 * s, o.doctor ? '#3a4157' : JEANS, o.seed, { amp: 0.8, edge: false });
  p.paper(x + 2 * s, y - 34 * s, 11 * s, 34 * s, o.doctor ? '#3a4157' : JEANS, o.seed + 1, { amp: 0.8, edge: false });
  p.shadow(true);
  p.paper(x - 19 * s, y - 88 * s, 38 * s, 58 * s, body, o.seed + 2, { amp: 1.2 });
  p.shadow(false);
  ctx.save();
  ctx.lineCap = 'round';
  // the stethoscope says who the doctor is
  if (o.doctor) {
    ctx.strokeStyle = c.accent;
    ctx.lineWidth = 2.6 * s;
    ctx.beginPath();
    ctx.moveTo(x - 9 * s, y - 86 * s);
    ctx.quadraticCurveTo(x - 10 * s, y - 62 * s, x + 2 * s, y - 58 * s);
    ctx.moveTo(x + 9 * s, y - 86 * s);
    ctx.quadraticCurveTo(x + 10 * s, y - 64 * s, x + 2 * s, y - 58 * s);
    ctx.stroke();
    p.circle(x + 2 * s, y - 55 * s, 4 * s, c.accent);
  }
  // arms: one hangs, the other waves when asked to
  ctx.strokeStyle = body;
  ctx.lineWidth = 9 * s;
  const sh = y - 80 * s;
  ctx.beginPath();
  ctx.moveTo(x - dir * 17 * s, sh);
  ctx.lineTo(x - dir * 21 * s, sh + 34 * s);
  ctx.stroke();
  p.circle(x - dir * 21 * s, sh + 38 * s, 5 * s, skin);
  const w = o.wave ?? 0;
  const ang = -Math.PI / 2 * w + Math.sin(p.now / 180) * 0.35 * w;
  const hx = x + dir * (17 * s + Math.cos(ang) * 30 * s * (w ? 0.6 : 0.15));
  const hy = sh + (w ? Math.sin(ang) * 30 * s : 34 * s);
  ctx.beginPath();
  ctx.moveTo(x + dir * 17 * s, sh);
  ctx.lineTo(w ? hx : x + dir * 21 * s, w ? hy : sh + 34 * s);
  ctx.stroke();
  p.circle(w ? hx : x + dir * 21 * s, (w ? hy : sh + 34 * s) + 4 * s, 5 * s, skin);
  ctx.restore();
  // head
  const r = 16 * s;
  const hy0 = y - 104 * s;
  p.circle(x, hy0, r + 2, c.fibre);
  p.circle(x, hy0, r, skin);
  ctx.save();
  ctx.fillStyle = o.doctor ? HAIR_DOC : HAIR;
  ctx.beginPath();
  ctx.arc(x, hy0 - 1 * s, r + 1.5, Math.PI * 1.02, Math.PI * 1.98);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  face(p, x, hy0 + 2 * s, r, o.mood, dir);
}

/** the district's surgery: open and lit, or shut with tape across the door */
function surgery(p: Painter, x: number, gy: number, u: number, o: { open: boolean; kind: Kind; seed: number; lit?: number }) {
  const { ctx, c } = p;
  const w = 136 * u;
  const h = 92 * u;
  const wall = o.open ? (o.kind === 'gp' ? c.gp : c.dental) : mixGrey(p);
  p.shadow(true);
  p.paper(x - w / 2, gy - h, w, h, wall, o.seed, { amp: 1.4 });
  p.shadow(false);
  ctx.save();
  ctx.fillStyle = c.fibre;
  ctx.beginPath();
  ctx.moveTo(x - w * 0.6, gy - h + 4);
  ctx.lineTo(x, gy - h - 54 * u);
  ctx.lineTo(x + w * 0.6, gy - h + 4);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = c.paper;
  ctx.beginPath();
  ctx.moveTo(x - w * 0.55, gy - h + 2);
  ctx.lineTo(x, gy - h - 50 * u);
  ctx.lineTo(x + w * 0.55, gy - h + 2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  // the sign under the roof's peak: a cross, or a little tooth
  const sy = gy - h - 18 * u;
  if (o.kind === 'gp') {
    ctx.save();
    ctx.fillStyle = o.open ? c.alert : '#8b98ab';
    ctx.fillRect(x - 4 * u, sy - 12 * u, 8 * u, 24 * u);
    ctx.fillRect(x - 12 * u, sy - 4 * u, 24 * u, 8 * u);
    ctx.restore();
  } else {
    tooth(p, x, sy + 4 * u, 13 * u, { mood: o.open ? 'happy' : 'sad', seed: o.seed + 5, plain: true });
  }
  // windows
  const lit = o.open ? (o.lit ?? 1) : 0;
  for (const s of [-1, 1]) {
    const wx = x + s * w * 0.3 - 13 * u;
    p.paper(wx, gy - h + 20 * u, 26 * u, 24 * u, lit > 0.5 ? LIGHT : DARK, o.seed + 10 + s, { amp: 0.7 });
  }
  // the door
  const dw = 32 * u;
  const dh = 56 * u;
  if (o.open) {
    p.paper(x - dw / 2, gy - dh, dw, dh, DARK, o.seed + 20, { amp: 0.6 });
    ctx.save();
    ctx.globalAlpha = 0.55 + 0.1 * Math.sin(p.now / 400);
    ctx.fillStyle = LIGHT;
    ctx.beginPath();
    ctx.moveTo(x - dw / 2, gy);
    ctx.lineTo(x + dw / 2, gy);
    ctx.lineTo(x + dw * 1.6, gy + 6 * u);
    ctx.lineTo(x - dw * 1.6, gy + 6 * u);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  } else {
    p.paper(x - dw / 2, gy - dh, dw, dh, DOOR, o.seed + 21, { amp: 0.6 });
    for (const s of [-1, 1]) {
      p.paper(x - dw * 0.9, gy - dh * 0.55 - 4 * u, dw * 1.8, 8 * u, c.soft, o.seed + 30 + s, { rot: s * 0.62, amp: 0.8 });
    }
  }
}

/** a greyed-out wall colour for a shut surgery, from the theme's own track */
function mixGrey(p: Painter): string {
  return p.c.mode === 'day' ? '#b9c2cf' : '#5d6a86';
}

function hospital(p: Painter, x: number, gy: number, u: number, seed: number) {
  const { ctx, c } = p;
  const w = 120 * u;
  const h = 150 * u;
  p.shadow(true);
  p.paper(x - w / 2, gy - h, w, h, c.paper, seed, { amp: 1.5 });
  p.shadow(false);
  for (let r = 0; r < 4; r++) {
    for (let k = 0; k < 3; k++) {
      p.paper(x - w / 2 + 14 * u + k * 34 * u, gy - h + 44 * u + r * 24 * u, 22 * u, 14 * u, r === 3 && k === 1 ? DARK : '#9fb4d6', seed + r * 3 + k, { amp: 0.5, edge: false });
    }
  }
  ctx.save();
  ctx.fillStyle = c.alert;
  ctx.fillRect(x - 5 * u, gy - h + 8 * u, 10 * u, 28 * u);
  ctx.fillRect(x - 14 * u, gy - h + 17 * u, 28 * u, 10 * u);
  ctx.restore();
}

function ambulance(p: Painter, x: number, gy: number, u: number, seed: number) {
  const { c } = p;
  p.shadow(true);
  p.paper(x - 48 * u, gy - 46 * u, 70 * u, 38 * u, c.paper, seed, { amp: 1 });
  p.paper(x + 22 * u, gy - 34 * u, 26 * u, 26 * u, c.paper, seed + 1, { amp: 1 });
  p.shadow(false);
  p.paper(x - 48 * u, gy - 26 * u, 96 * u, 6 * u, c.alert, seed + 2, { amp: 0.5, edge: false });
  p.paper(x + 27 * u, gy - 30 * u, 15 * u, 10 * u, '#9fb4d6', seed + 3, { amp: 0.4, edge: false });
  p.ctx.save();
  p.ctx.fillStyle = c.alert;
  p.ctx.fillRect(x - 17 * u, gy - 42 * u, 6 * u, 18 * u);
  p.ctx.fillRect(x - 23 * u, gy - 36 * u, 18 * u, 6 * u);
  p.ctx.restore();
  const blink = Math.floor(p.now / 260) % 2 === 0;
  p.circle(x - 8 * u, gy - 50 * u, 5 * u, blink ? '#5aa9ff' : c.alert);
  for (const wx of [x - 30 * u, x + 30 * u]) {
    p.circle(wx, gy - 6 * u, 9 * u, INK);
    p.circle(wx, gy - 6 * u, 3.5 * u, '#c9ced8');
  }
}

function magnifier(p: Painter, x: number, y: number, r: number, inside?: () => void) {
  const { ctx } = p;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#3b3f4c';
  ctx.lineWidth = r * 0.3;
  ctx.beginPath();
  ctx.moveTo(x + r * 0.72, y + r * 0.72);
  ctx.lineTo(x + r * 1.55, y + r * 1.55);
  ctx.stroke();
  ctx.fillStyle = 'rgba(220, 240, 255, 0.38)';
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  if (inside) {
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, r * 0.92, 0, Math.PI * 2); ctx.clip();
    inside();
    ctx.restore();
  }
  ctx.strokeStyle = p.c.fibre;
  ctx.lineWidth = r * 0.22;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = '#3b3f4c';
  ctx.lineWidth = r * 0.12;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

/** a round paper badge with a tick: found in time, done */
function tick(p: Painter, x: number, y: number, r: number, k: number, color: string) {
  if (k <= 0) return;
  const s = r * ease.back(k);
  const { ctx } = p;
  p.shadow(true);
  p.circle(x, y, s + 2, p.c.fibre);
  p.circle(x, y, s, color);
  p.shadow(false);
  ctx.save();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = s * 0.24;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x - s * 0.42, y + s * 0.02);
  ctx.lineTo(x - s * 0.1, y + s * 0.34);
  ctx.lineTo(x + s * 0.46, y - s * 0.3);
  ctx.stroke();
  ctx.restore();
}

function pill(p: Painter, x: number, y: number, s: number, rot: number, a: string, b: string) {
  const { ctx } = p;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  const cap = (color: string, from: number) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(from * s * 0.5, 0, s * 0.32, from < 0 ? Math.PI / 2 : -Math.PI / 2, from < 0 ? Math.PI * 1.5 : Math.PI / 2);
    ctx.lineTo(0, from < 0 ? -s * 0.32 : s * 0.32);
    ctx.lineTo(0, from < 0 ? s * 0.32 : -s * 0.32);
    ctx.closePath();
    ctx.fill();
  };
  ctx.fillStyle = p.c.fibre;
  ctx.beginPath();
  ctx.roundRect(-s * 0.86, -s * 0.38, s * 1.72, s * 0.76, s * 0.38);
  ctx.fill();
  cap(a, -1);
  cap(b, 1);
  ctx.restore();
}

function calendarPage(p: Painter, x: number, y: number, s: number, rot: number, seed: number, alpha = 1) {
  p.paper(x - s / 2, y - s * 0.55, s, s * 1.1, '#fbf7ee', seed, { rot, alpha, amp: 0.8 });
  p.paper(x - s / 2, y - s * 0.55, s, s * 0.28, p.c.alert, seed + 1, { rot, alpha, amp: 0.6, edge: false });
}

/** a tooth with a face; `cavity` (0..1) is a dark hole, `filled` (0..1) a paper filling over it */
function tooth(p: Painter, x: number, y: number, s: number, o: { mood: Face; seed: number; cavity?: number; filled?: number; plain?: boolean; tilt?: number }) {
  const { ctx, c } = p;
  ctx.save();
  if (o.tilt) { ctx.translate(x, y); ctx.rotate(o.tilt); ctx.translate(-x, -y); }
  const path = (k: number) => {
    ctx.beginPath();
    ctx.moveTo(x - k * 0.9, y - k * 0.5);
    ctx.bezierCurveTo(x - k * 1.05, y - k * 1.25, x - k * 0.25, y - k * 1.2, x, y - k * 0.95);
    ctx.bezierCurveTo(x + k * 0.25, y - k * 1.2, x + k * 1.05, y - k * 1.25, x + k * 0.9, y - k * 0.5);
    ctx.bezierCurveTo(x + k * 0.8, y + k * 0.1, x + k * 0.7, y + k * 0.5, x + k * 0.55, y + k * 1.05);
    ctx.bezierCurveTo(x + k * 0.45, y + k * 1.3, x + k * 0.25, y + k * 1.2, x + k * 0.2, y + k * 0.75);
    ctx.quadraticCurveTo(x, y + k * 0.45, x - k * 0.2, y + k * 0.75);
    ctx.bezierCurveTo(x - k * 0.25, y + k * 1.2, x - k * 0.45, y + k * 1.3, x - k * 0.55, y + k * 1.05);
    ctx.bezierCurveTo(x - k * 0.7, y + k * 0.5, x - k * 0.8, y + k * 0.1, x - k * 0.9, y - k * 0.5);
    ctx.closePath();
  };
  if (!o.plain) p.shadow(true);
  ctx.fillStyle = c.fibre;
  path(s * 1.08);
  ctx.fill();
  p.shadow(false);
  ctx.fillStyle = c.paper;
  path(s);
  ctx.fill();
  if (p.grain) { ctx.globalAlpha = 0.5; ctx.fillStyle = p.grain; ctx.fill(); ctx.globalAlpha = 1; }
  const cav = clamp(o.cavity ?? 0);
  const cx = x + s * 0.42;
  const cy = y - s * 0.62;
  if (cav > 0) {
    const r = rng(o.seed);
    ctx.fillStyle = CAVITY;
    ctx.beginPath();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const rr = s * (0.06 + 0.24 * cav) * (0.8 + r() * 0.4);
      ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.85);
    }
    ctx.closePath();
    ctx.fill();
  }
  const fill = clamp(o.filled ?? 0);
  if (fill > 0) {
    const fr = s * (0.06 + 0.24 * cav) * 1.25 * ease.back(fill);
    p.circle(cx, cy, fr + 1.5, c.fibre);
    p.circle(cx, cy, fr, c.dental);
  }
  if (!o.plain || s > 20) face(p, x - s * 0.05, y - s * 0.25, s * 0.55, o.mood);
  else face(p, x, y - s * 0.25, s * 0.6, o.mood);
  ctx.restore();
}

function sparkles(p: Painter, x: number, y: number, spread: number, k: number, n = 6, seed = 3) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2;
    const d = spread * (0.5 + r() * 0.5) * ease.out(k);
    const tw = 0.5 + 0.5 * Math.sin(p.now / 240 + i * 1.7);
    p.star(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.7, (4 + r() * 4) * (0.6 + 0.4 * tw), p.c.star, k * (0.6 + 0.4 * tw));
  }
}

function painBolts(p: Painter, x: number, y: number, r: number, k: number) {
  const { ctx } = p;
  ctx.save();
  ctx.strokeStyle = p.c.alert;
  ctx.lineWidth = Math.max(2, r * 0.07);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalAlpha *= k;
  const jitter = Math.sin(p.now / 90) * 2;
  for (const a of [-2.4, -1.6, -0.7, 0.3]) {
    const x0 = x + Math.cos(a) * r;
    const y0 = y + Math.sin(a) * r;
    const dx = Math.cos(a) * r * 0.35;
    const dy = Math.sin(a) * r * 0.35;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x0 + dx * 0.5 - dy * 0.3 + jitter, y0 + dy * 0.5 + dx * 0.3);
    ctx.lineTo(x0 + dx * 0.6 + dy * 0.3, y0 + dy * 0.6 - dx * 0.3 + jitter);
    ctx.lineTo(x0 + dx * 1.1, y0 + dy * 1.1);
    ctx.stroke();
  }
  ctx.restore();
}

function coins(p: Painter, x: number, gy: number, u: number, k: number, max = 9) {
  const n = Math.round(max * ease.out(k));
  for (let i = 0; i < n; i++) p.coin(x + (i % 2 ? 1.5 : -1.5) * u, gy - 8 * u - i * 8 * u, 18 * u);
}

function road(p: Painter, x0: number, x1: number, y: number, u: number, k: number) {
  const { ctx } = p;
  ctx.save();
  ctx.strokeStyle = p.c.rule;
  ctx.globalAlpha *= 0.75;
  ctx.setLineDash([8 * u, 7 * u]);
  ctx.lineWidth = 3 * u;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x0, y);
  ctx.lineTo(x0 + (x1 - x0) * ease.inOut(k), y);
  ctx.stroke();
  ctx.restore();
}

function heart(p: Painter, x: number, y: number, s: number, color: string, alpha = 1) {
  const { ctx } = p;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.35);
  ctx.bezierCurveTo(x - s, y - s * 0.3, x - s * 0.45, y - s, x, y - s * 0.45);
  ctx.bezierCurveTo(x + s * 0.45, y - s, x + s, y - s * 0.3, x, y + s * 0.35);
  ctx.fill();
  ctx.restore();
}

/* ------------------------------------------------------------ scenes */

type Draw = (p: Painter, t: number) => void;

/** the patient walking up to the surgery, which is open or shut */
const arrive = (kind: Kind, open: boolean): Draw => (p, t) => {
  const { u, gy, cx } = frame(p);
  const hx = cx + 90 * u;
  surgery(p, hx, gy, u, { open, kind, seed: 40, lit: span(t, 0.1, 0.3) });
  if (open) figure(p, hx + 2 * u, gy - 2 * u, u * 0.92, { doctor: true, mood: 'happy', dir: -1, wave: span(t, 0.45, 0.6), seed: 70 });
  const walk = ease.inOut(span(t, 0, 0.6));
  const px = cx - 220 * u + walk * 150 * u;
  figure(p, px, gy, u, { mood: open ? (walk > 0.95 ? 'happy' : 'calm') : (walk > 0.8 ? 'worried' : 'calm'), seed: 10, bob: walk < 1 ? (p.now / 300) % 1 : 0 });
  if (open) {
    const k = span(t, 0.65, 0.85);
    heart(p, px + 4 * u, gy - 150 * u - k * 14 * u, 12 * u, p.c.alert, k);
  } else {
    // the substitute is somewhere else: a long dashed road to a far, small surgery
    const k = span(t, 0.55, 0.9);
    road(p, px + 30 * u, p.W - 34 * u, gy - 4 * u, u, k);
    if (k > 0.6) surgery(p, p.W - 30 * u, gy - 4 * u, u * 0.28, { open: true, kind, seed: 41 });
  }
};

/** the screening: a magnifier over the patient (GP) or over a tooth (dental) */
const screen = (kind: Kind): Draw => (p, t) => {
  const { u, gy, cx } = frame(p);
  const sweep = ease.inOut(span(t, 0.05, 0.55));
  if (kind === 'gp') {
    figure(p, cx - 80 * u, gy, u, { doctor: true, mood: 'calm', dir: 1, seed: 70 });
    figure(p, cx + 60 * u, gy, u, { mood: sweep > 0.95 ? 'happy' : 'calm', dir: -1, seed: 10 });
    const mx = cx + 60 * u + (sweep - 0.5) * 30 * u;
    const my = gy - 120 * u + sweep * 60 * u;
    magnifier(p, mx, my, 26 * u, () => {
      const k = span(t, 0.5, 0.65);
      if (k > 0) p.circle(cx + 66 * u, gy - 64 * u, 3.5 * u * (1 + 0.15 * Math.sin(p.now / 200)), p.c.soft, k);
    });
  } else {
    tooth(p, cx, gy - 120 * u, 62 * u, { mood: sweep > 0.95 ? 'happy' : 'calm', seed: 7, cavity: span(t, 0.45, 0.6) * 0.2 });
    magnifier(p, cx + (sweep - 0.5) * 100 * u + 26 * u, gy - 160 * u + sweep * 40 * u, 30 * u);
  }
  tick(p, cx + 150 * u, gy - 170 * u, 18 * u, span(t, 0.62, 0.78), p.c.accent);
};

/** treated in time: pills and a ticked list (GP), a small filling (dental) */
const treat = (kind: Kind): Draw => (p, t) => {
  const { u, gy, cx } = frame(p);
  if (kind === 'gp') {
    figure(p, cx - 40 * u, gy, u, { mood: 'happy', seed: 10, wave: span(t, 0.7, 0.85) });
    for (let i = 0; i < 3; i++) {
      const k = ease.back(span(t, 0.08 + i * 0.12, 0.3 + i * 0.12));
      if (k <= 0) continue;
      pill(p, cx - 150 * u + i * 28 * u, gy - 150 * u + (1 - k) * 40 * u + Math.sin(p.now / 400 + i) * 3 * u, 22 * u * k, -0.5 + i * 0.4, p.c.dental, p.c.paper);
    }
    // the follow-up list: three ticks one after another
    p.shadow(true);
    p.paper(cx + 60 * u, gy - 160 * u, 90 * u, 120 * u, '#fbf7ee', 60, { amp: 1, rot: 0.03 });
    p.shadow(false);
    for (let i = 0; i < 3; i++) {
      const ly = gy - 128 * u + i * 32 * u;
      p.paper(cx + 92 * u, ly - 3 * u, 46 * u, 6 * u, '#c9d6ec', 61 + i, { amp: 0.4, edge: false });
      tick(p, cx + 76 * u, ly, 9 * u, span(t, 0.35 + i * 0.13, 0.5 + i * 0.13), p.c.accent);
    }
  } else {
    const fill = span(t, 0.25, 0.5);
    tooth(p, cx, gy - 120 * u, 62 * u, { mood: fill > 0.9 ? 'happy' : 'calm', seed: 7, cavity: 0.2, filled: fill });
    sparkles(p, cx + 26 * u, gy - 160 * u, 70 * u, span(t, 0.5, 0.75), 7, 9);
  }
};

/** the complication that never came: a hospital sinking out of the picture, a happy patient */
const spared = (kind: Kind): Draw => (p, t) => {
  const { u, gy, cx } = frame(p);
  const sink = ease.inOut(span(t, 0.15, 0.7));
  p.ctx.save();
  p.ctx.beginPath();
  p.ctx.rect(0, 0, p.W, gy - 2);
  p.ctx.clip();
  hospital(p, cx + 170 * u, gy + sink * 170 * u, u * 0.85, 80);
  p.ctx.restore();
  if (kind === 'gp') {
    const hop = Math.max(0, Math.sin(p.now / 260)) * 8 * u * span(t, 0.4, 0.6);
    figure(p, cx - 60 * u, gy, u, { mood: 'happy', seed: 10, lift: hop, wave: span(t, 0.3, 0.5) });
    sparkles(p, cx - 60 * u, gy - 130 * u, 90 * u, span(t, 0.5, 0.8), 7, 4);
    const k = span(t, 0.55, 0.8);
    heart(p, cx - 60 * u, gy - 165 * u + Math.sin(p.now / 500) * 4 * u, 22 * u * ease.back(k), p.c.alert, k);
  } else {
    for (let i = 0; i < 5; i++) {
      const k = ease.back(span(t, 0.05 + i * 0.08, 0.3 + i * 0.08));
      if (k <= 0) continue;
      const bounce = Math.max(0, Math.sin(p.now / 280 + i)) * 4 * u;
      tooth(p, cx - 170 * u + i * 62 * u, gy - 60 * u - bounce, 28 * u * k, { mood: 'happy', seed: 20 + i });
    }
    sparkles(p, cx - 50 * u, gy - 120 * u, 140 * u, span(t, 0.5, 0.8), 9, 6);
  }
};

/** screenings missed: the calendar's pages blow away */
const missed = (kind: Kind): Draw => (p, t) => {
  const { u, gy, cx } = frame(p);
  if (kind === 'gp') figure(p, cx - 120 * u, gy, u, { mood: 'sad', seed: 10 });
  else tooth(p, cx - 100 * u, gy - 110 * u, 56 * u, { mood: 'calm', seed: 7, cavity: 0.15 + 0.2 * span(t, 0.3, 1) });
  // the pages keep blowing away for as long as the step is shown
  const on = span(t, 0, 0.15);
  for (let i = 0; i < 5; i++) {
    const k = (p.now / 3200 + i / 5) % 1;
    if (on <= 0) continue;
    const x = cx - 20 * u + k * (p.W * 0.55);
    const y = gy - 170 * u + Math.sin(k * 6 + i) * 24 * u - k * 40 * u;
    calendarPage(p, x, y, 30 * u, k * 5 + i, 90 + i * 3, on * span(k, 0, 0.1) * (1 - span(k, 0.75, 1)));
  }
  // the magnifier lies unused, greyed out
  p.ctx.save();
  p.ctx.globalAlpha = 0.45;
  magnifier(p, cx + 20 * u, gy - 30 * u, 18 * u);
  p.ctx.restore();
};

/** found late: the lesion has grown, the patient (or the tooth) is in pain */
const late = (kind: Kind): Draw => (p, t) => {
  const { u, gy, cx } = frame(p);
  const grow = ease.out(span(t, 0.05, 0.6));
  if (kind === 'gp') {
    figure(p, cx, gy, u * 1.05, { mood: 'worried', seed: 10 });
    const pulse = 1 + 0.12 * Math.sin(p.now / 180);
    const r = (6 + 16 * grow) * u * pulse;
    p.circle(cx + 4 * u, gy - 62 * u, r + 2, p.c.fibre, 0.8);
    p.circle(cx + 4 * u, gy - 62 * u, r, p.c.alert, 0.9);
    painBolts(p, cx, gy - 70 * u, 70 * u, span(t, 0.4, 0.6));
  } else {
    tooth(p, cx, gy - 120 * u, 64 * u, { mood: 'worried', seed: 7, cavity: 0.35 + 0.65 * grow, tilt: Math.sin(p.now / 70) * 0.012 * span(t, 0.4, 0.6) });
    painBolts(p, cx, gy - 150 * u, 90 * u, span(t, 0.4, 0.6));
  }
};

/** the costlier end: hospital and ambulance (GP), an extracted tooth (dental), and coins */
const costly = (kind: Kind): Draw => (p, t) => {
  const { u, gy, cx } = frame(p);
  if (kind === 'gp') {
    hospital(p, cx + 150 * u, gy, u, 80);
    const drive = ease.inOut(span(t, 0.05, 0.6));
    ambulance(p, -60 * u + drive * (cx + 60 * u), gy, u, 85);
  } else {
    for (let i = 0; i < 5; i++) {
      const out = i === 2 ? ease.inOut(span(t, 0.15, 0.55)) : 0;
      tooth(p, cx - 150 * u + i * 62 * u, gy - 60 * u - out * 120 * u, 28 * u, {
        mood: i === 2 ? 'sad' : 'worried', seed: 20 + i, cavity: i === 2 ? 0.9 : 0,
      });
    }
  }
  coins(p, cx - 230 * u, gy, u, span(t, 0.45, 0.9), 10);
};

const SCENES: Record<Variant, ((kind: Kind) => Draw)[]> = {
  ok: [(k) => arrive(k, true), screen, treat, spared],
  broken: [(k) => arrive(k, false), missed, late, costly],
};

/** Draws one step of the chain; t is the step's own time, 0 → 1. */
export function drawPrevention(p: Painter, kind: Kind, variant: Variant, scene: number, t: number) {
  const make = SCENES[variant][scene];
  if (make) make(kind)(p, clamp(t));
}
