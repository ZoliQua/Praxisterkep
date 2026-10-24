// Drawing for the animated stories: a cut-paper look on a sky — night-blue
// with stars and a crescent moon in the dark theme, a pale daytime sky with a
// paper sun and torn clouds in the light one. Every piece of paper has a torn
// edge (a jittered outline over a slightly larger white one, as paper torn by
// hand shows its fibre), a faint grain, and the data colours come from the
// reader's palette. All colours are CSS custom properties (story.css holds
// the sky and ink of each theme), read again when the theme or palette
// changes. Pure canvas 2D, no framework and no library: every frame is drawn
// by these functions.

export type SkyMode = 'night' | 'day';

export type Colors = {
  mode: SkyMode;
  accent: string; gp: string; dental: string; alert: string; soft: string; s2: string; s3: string; s5: string;
  ink: string; dim: string; faint: string;
  sky: string; skyLow: string; band1: string; band2: string; band3: string;
  paper: string; paperLine: string; paperMargin: string; handInk: string; star: string;
  /** the neutral of unlit people and of an empty donut track */
  track: string;
  /** reference lines and small markers drawn straight on the sky */
  rule: string;
  /** the torn white fibre along every paper edge */
  fibre: string;
  /** the drop shadow under raised paper */
  shade: string;
  /** daytime clouds */
  cloud: string;
};

export function readColors(el: Element): Colors {
  const cs = getComputedStyle(el);
  const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
  const mode: SkyMode = v('--story-mode', 'night') === 'day' ? 'day' : 'night';
  return {
    mode,
    accent: v('--accent', '#4fd6c2'), gp: v('--gp', '#6ea8ff'), dental: v('--dental', '#4fd6c2'),
    alert: v('--alert', '#ff7a59'), soft: v('--alert-soft', '#ffb454'),
    s2: v('--s2', '#6ea8ff'), s3: v('--s3', '#ffb454'), s5: v('--s5', '#b48cff'),
    ink: v('--story-ink', '#e9eef5'), dim: v('--story-dim', '#9aa8bb'), faint: v('--story-faint', '#64748b'),
    sky: v('--story-sky', '#1d2550'), skyLow: v('--story-sky-low', '#2c3a78'),
    band1: v('--story-band1', '#28336b'), band2: v('--story-band2', '#323f80'), band3: v('--story-band3', '#3a4a8f'),
    paper: v('--story-paper', '#f7f1e3'), paperLine: '#c9d6ec', paperMargin: '#e58a8a', handInk: '#2f4aa0',
    star: v('--story-star', '#f3d77a'),
    track: v('--story-track', 'rgba(233,238,245,0.3)'),
    rule: v('--story-rule', '#f7f1e3'),
    fibre: v('--story-fibre', 'rgba(255,255,255,0.92)'),
    shade: v('--story-shade', 'rgba(5,8,25,0.45)'),
    cloud: v('--story-cloud', '#ffffff'),
  };
}

/** A small deterministic random stream (mulberry32), so every frame tears the paper the same way. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const ease = {
  out: (t: number) => 1 - (1 - clamp(t)) ** 3,
  inOut: (t: number) => { const x = clamp(t); return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2; },
  back: (t: number) => { const x = clamp(t); const c = 1.70158; return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2; },
};
export function clamp(t: number, lo = 0, hi = 1) { return Math.max(lo, Math.min(hi, t)); }
/** The part of a scene's 0..1 time that falls between `a` and `b`, as 0..1. */
export function span(t: number, a: number, b: number) { return clamp((t - a) / (b - a)); }

const nfCache = new Map<string, Intl.NumberFormat>();
/** A number in the given locale (Hungarian unless told otherwise). */
export function num(v: number, d = 0, locale = 'hu-HU'): string {
  const key = `${locale}|${d}`;
  let f = nfCache.get(key);
  if (!f) nfCache.set(key, (f = new Intl.NumberFormat(locale, { minimumFractionDigits: d, maximumFractionDigits: d })));
  return f.format(v);
}
export function pct(v: number, d = 0, locale = 'hu-HU'): string { return `${num(100 * v, d, locale)}%`; }

/** How the scenes write their own numbers (legends, donut middles): the host page passes its locale's. */
export type NumberFormat = { num: (v: number) => string; pct: (v: number) => string };
const DEFAULT_FORMAT: NumberFormat = { num: (v) => num(v), pct: (v) => pct(v) };

/** '#rgb', '#rrggbb' or 'rgb(a)(…)' as [r, g, b]; null for anything else. */
function parseRgb(color: string): [number, number, number] | null {
  const c = color.trim();
  let m = /^#([0-9a-f]{3})$/i.exec(c);
  if (m) return [0, 1, 2].map((i) => parseInt(m![1][i] + m![1][i], 16)) as [number, number, number];
  m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(c);
  if (m) return [0, 2, 4].map((i) => parseInt(m![1].slice(i, i + 2), 16)) as [number, number, number];
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(c);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  return null;
}

/** `a` moved toward `b` by `k` (0..1); `a` unchanged when either cannot be read. */
export function mix(a: string, b: string, k: number): string {
  const x = parseRgb(a);
  const y = parseRgb(b);
  if (!x || !y) return a;
  const c = x.map((v, i) => Math.round(v + (y[i] - v) * k));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

/** A jittered outline around a rectangle: points every ~step px, pushed in or out a little. */
function tornPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, seed: number, amp: number, step = 7) {
  const r = rng(seed);
  const pts: [number, number][] = [];
  const edge = (x0: number, y0: number, x1: number, y1: number, nx: number, ny: number) => {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(2, Math.round(len / step));
    for (let i = 0; i < n; i++) {
      const f = i / n;
      const j = (r() - 0.5) * 2 * amp;
      pts.push([x0 + (x1 - x0) * f + nx * j, y0 + (y1 - y0) * f + ny * j]);
    }
  };
  edge(x, y, x + w, y, 0, 1);
  edge(x + w, y, x + w, y + h, 1, 0);
  edge(x + w, y + h, x, y + h, 0, 1);
  edge(x, y + h, x, y, 1, 0);
  ctx.beginPath();
  pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
  ctx.closePath();
}

/** A jittered circle: the outline of a torn paper disc. */
function tornCircle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, seed: number, amp: number) {
  const rnd = rng(seed);
  const n = Math.max(18, Math.round((2 * Math.PI * r) / 6));
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r + (rnd() - 0.5) * 2 * amp;
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
  }
  ctx.closePath();
}

export class Painter {
  ctx: CanvasRenderingContext2D;
  W: number;
  H: number;
  c: Colors;
  hand: string;
  body: string;
  display: string;
  grain: CanvasPattern | null;
  now: number;
  fmt: NumberFormat;

  constructor(ctx: CanvasRenderingContext2D, W: number, H: number, c: Colors, fonts: { hand: string; body: string; display: string }, grain: CanvasPattern | null, now: number, fmt: NumberFormat = DEFAULT_FORMAT) {
    this.ctx = ctx; this.W = W; this.H = H; this.c = c; this.grain = grain; this.now = now; this.fmt = fmt;
    this.hand = fonts.hand; this.body = fonts.body; this.display = fonts.display;
  }

  /** narrow canvases (phones) lay the scene out in one column */
  get narrow() { return this.W < 560; }
  /** where the data picture goes */
  get stage() {
    const { W, H } = this;
    return this.narrow
      ? { x: 14, y: 96, w: W - 28, h: H * 0.47 }
      : { x: W * 0.27, y: H * 0.07, w: W * 0.7, h: H * 0.6 };
  }

  font(size: number, kind: 'hand' | 'body' | 'display' = 'body', weight = 400) {
    const fam = kind === 'hand' ? this.hand : kind === 'display' ? this.display : this.body;
    this.ctx.font = `${weight} ${size}px ${fam}`;
  }

  /** A colour fit for text straight on the sky: in daylight a data colour is
   *  darkened toward the ink, or a pale teal number would vanish on a pale sky. */
  readable(color: string): string {
    const { c } = this;
    if (c.mode !== 'day' || color === c.ink || color === c.dim) return color;
    return mix(color, c.ink, 0.5);
  }

  text(s: string, x: number, y: number, o: { size?: number; color?: string; align?: CanvasTextAlign; kind?: 'hand' | 'body' | 'display'; weight?: number; alpha?: number; base?: CanvasTextBaseline; onPaper?: boolean } = {}) {
    const { ctx } = this;
    ctx.save();
    this.font(o.size ?? 16, o.kind ?? 'body', o.weight ?? 400);
    const color = o.color ?? this.c.ink;
    ctx.fillStyle = o.onPaper ? color : this.readable(color);
    ctx.textAlign = o.align ?? 'left';
    ctx.textBaseline = o.base ?? 'alphabetic';
    ctx.globalAlpha *= o.alpha ?? 1;
    ctx.fillText(s, x, y);
    ctx.restore();
  }

  /** words wrapped to a width; returns the lines */
  wrap(s: string, maxW: number): string[] {
    const words = s.split(/\s+/);
    const lines: string[] = [];
    let line = '';
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (this.ctx.measureText(next).width > maxW && line) { lines.push(line); line = w; } else line = next;
    }
    if (line) lines.push(line);
    return lines;
  }

  /** a piece of torn paper: white fibre edge, the colour, a faint grain */
  paper(x: number, y: number, w: number, h: number, color: string, seed: number, o: { alpha?: number; edge?: boolean; rot?: number; amp?: number } = {}) {
    if (w <= 0.5 || h <= 0.5) return;
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha *= o.alpha ?? 1;
    if (o.rot) {
      ctx.translate(x + w / 2, y + h / 2);
      ctx.rotate(o.rot);
      ctx.translate(-(x + w / 2), -(y + h / 2));
    }
    const amp = o.amp ?? Math.min(2.2, Math.min(w, h) / 8);
    if (o.edge !== false) {
      ctx.fillStyle = this.c.fibre;
      tornPath(ctx, x - 2, y - 2, w + 4, h + 4, seed + 7, amp * 1.2, 6);
      ctx.fill();
    }
    ctx.fillStyle = color;
    tornPath(ctx, x, y, w, h, seed, amp, 7);
    ctx.fill();
    if (this.grain) {
      ctx.globalAlpha *= 0.5;
      ctx.fillStyle = this.grain;
      ctx.fill();
    }
    ctx.restore();
  }

  /** a soft drop shadow under the next shapes */
  shadow(on: boolean) {
    const { ctx } = this;
    ctx.shadowColor = on ? this.c.shade : 'transparent';
    ctx.shadowBlur = on ? 10 : 0;
    ctx.shadowOffsetY = on ? 3 : 0;
  }

  circle(x: number, y: number, r: number, color: string, alpha = 1) {
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(0, r), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** a five-pointed star, the night sky's */
  star(x: number, y: number, r: number, color: string, alpha = 1) {
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? r * 0.45 : r;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /** a torn-paper cloud: three overlapping discs on a flat base */
  cloud(x: number, y: number, s: number, seed: number, alpha = 1) {
    const { ctx, c } = this;
    ctx.save();
    ctx.globalAlpha *= alpha;
    const puffs: [number, number, number][] = [[-0.55, 0.1, 0.42], [0, -0.18, 0.58], [0.58, 0.08, 0.44]];
    ctx.fillStyle = c.fibre;
    puffs.forEach(([dx, dy, r], i) => { tornCircle(ctx, x + dx * s, y + dy * s, r * s + 2, seed + i, 1.4); ctx.fill(); });
    ctx.fillStyle = c.cloud;
    puffs.forEach(([dx, dy, r], i) => {
      tornCircle(ctx, x + dx * s, y + dy * s, r * s, seed + 10 + i, 1.1);
      ctx.fill();
      if (this.grain) { ctx.save(); ctx.globalAlpha *= 0.4; ctx.fillStyle = this.grain; ctx.fill(); ctx.restore(); }
    });
    ctx.restore();
  }

  /** a paper person: head and shoulders, the figure of a resident or a doctor */
  person(x: number, y: number, s: number, color: string, alpha = 1) {
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y - s * 0.62, s * 0.26, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x - s * 0.38, y);
    ctx.quadraticCurveTo(x - s * 0.38, y - s * 0.36, x, y - s * 0.36);
    ctx.quadraticCurveTo(x + s * 0.38, y - s * 0.36, x + s * 0.38, y);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /** a little surgery: walls, roof and a cross; `fill` is the wall colour (vacant: warm, filled: accent) */
  house(x: number, y: number, s: number, fill: string, seed: number, alpha = 1) {
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha *= alpha;
    this.paper(x - s * 0.42, y - s * 0.62, s * 0.84, s * 0.62, fill, seed, { amp: 1 });
    ctx.fillStyle = this.c.fibre;
    ctx.beginPath();
    ctx.moveTo(x - s * 0.56, y - s * 0.58);
    ctx.lineTo(x, y - s * 1.02);
    ctx.lineTo(x + s * 0.56, y - s * 0.58);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#1f2a55';
    ctx.fillRect(x - s * 0.05, y - s * 0.5, s * 0.1, s * 0.3);
    ctx.fillRect(x - s * 0.15, y - s * 0.4, s * 0.3, s * 0.1);
    ctx.restore();
  }

  /** a coin, for money */
  coin(x: number, y: number, r: number, alpha = 1) {
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.fillStyle = '#d9a63a';
    ctx.beginPath();
    ctx.ellipse(x, y + r * 0.18, r, r * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f3d77a';
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** a horizontal bar of torn paper with its label and value */
  bar(x: number, y: number, w: number, h: number, color: string, seed: number, label?: string, value?: string) {
    if (label) this.text(label, x - 10, y + h * 0.68, { size: Math.min(15, h * 0.62), align: 'right', color: this.c.ink });
    this.paper(x, y, Math.max(3, w), h, color, seed, { amp: 1.4 });
    if (value) this.text(value, x + Math.max(3, w) + 10, y + h * 0.7, { size: Math.min(17, h * 0.7), weight: 700, color: this.c.ink });
  }

  /** the caption: a torn note of lined paper with the handwritten line, written out letter by letter */
  note(say: string, progress: number) {
    const { W, H, c, ctx } = this;
    const w = this.narrow ? W - 24 : Math.min(W * 0.62, 640);
    const x = this.narrow ? 12 : W * 0.3;
    const size = this.narrow ? 19 : 23;
    this.font(size, 'hand');
    const lines = this.wrap(say, w - 54);
    const lh = this.narrow ? 23 : 27;
    const h = 22 + lines.length * lh;
    const y = H - h - (this.narrow ? 10 : 16);
    this.shadow(true);
    this.paper(x, y, w, h, c.paper, 913, { amp: 1.6, rot: -0.006 });
    this.shadow(false);
    ctx.save();
    ctx.strokeStyle = c.paperLine;
    ctx.lineWidth = 1;
    for (let i = 0; i < lines.length; i++) {
      const ly = y + 18 + (i + 1) * lh - lh * 0.22;
      ctx.beginPath(); ctx.moveTo(x + 8, ly); ctx.lineTo(x + w - 8, ly); ctx.stroke();
    }
    ctx.strokeStyle = c.paperMargin;
    ctx.beginPath(); ctx.moveTo(x + 30, y + 4); ctx.lineTo(x + 30, y + h - 4); ctx.stroke();
    ctx.restore();
    // written out: the share of letters grows with progress
    const total = lines.reduce((a, l) => a + l.length, 0);
    let left = Math.floor(total * clamp(progress));
    lines.forEach((l, i) => {
      const part = l.slice(0, Math.max(0, left));
      left -= l.length;
      if (part) this.text(part, x + 40, y + 14 + (i + 1) * lh - lh * 0.3, { size, kind: 'hand', color: c.handInk, onPaper: true });
    });
  }

  /** a tooth (dental pages) or a surgery (GP pages) with a face: the story's narrator */
  mascot(kind: 'tooth' | 'house', mood: 'happy' | 'worried' | 'surprised' | 'proud', t: number) {
    const { ctx, c } = this;
    // on a phone the narrator sits in the top left corner, above the picture
    const s = this.narrow ? 30 : Math.min(this.H * 0.2, 74);
    const x = this.narrow ? 44 : this.W * 0.13;
    const y = (this.narrow ? 58 : this.H * 0.5) + Math.sin(this.now / 520) * 3;
    ctx.save();
    this.shadow(true);
    if (kind === 'tooth') {
      ctx.fillStyle = c.fibre;
      const tooth = (grow: number) => {
        const k = s * grow;
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
      tooth(1.08);
      ctx.fill();
      this.shadow(false);
      tooth(1);
      ctx.fillStyle = c.paper;
      ctx.fill();
      if (this.grain) { ctx.globalAlpha = 0.5; ctx.fillStyle = this.grain; ctx.fill(); ctx.globalAlpha = 1; }
    } else {
      this.paper(x - s * 0.85, y - s * 0.55, s * 1.7, s * 1.35, c.paper, 51, { amp: 1.6 });
      this.shadow(false);
      ctx.fillStyle = c.accent;
      ctx.beginPath();
      ctx.moveTo(x - s * 1.05, y - s * 0.45);
      ctx.lineTo(x, y - s * 1.3);
      ctx.lineTo(x + s * 1.05, y - s * 0.45);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = c.paper;
      ctx.fillRect(x - s * 0.08, y - s * 1.05, s * 0.16, s * 0.42);
      ctx.fillRect(x - s * 0.21, y - s * 0.92, s * 0.42, s * 0.16);
    }
    // face
    const fy = kind === 'tooth' ? y - s * 0.35 : y + s * 0.1;
    const blink = (this.now % 3400) < 130;
    const eye = (ex: number) => {
      if (blink) {
        ctx.strokeStyle = '#1b1b2a'; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(ex - s * 0.09, fy); ctx.lineTo(ex + s * 0.09, fy); ctx.stroke();
        return;
      }
      this.circle(ex, fy, s * (mood === 'surprised' ? 0.12 : 0.1), '#1b1b2a');
      this.circle(ex + s * 0.035, fy - s * 0.04, s * 0.035, '#ffffff');
    };
    eye(x - s * 0.28);
    eye(x + s * 0.28);
    this.circle(x - s * 0.5, fy + s * 0.2, s * 0.1, '#f4a6a6', 0.8);
    this.circle(x + s * 0.5, fy + s * 0.2, s * 0.1, '#f4a6a6', 0.8);
    ctx.strokeStyle = '#1b1b2a'; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
    ctx.beginPath();
    if (mood === 'surprised') {
      ctx.ellipse(x, fy + s * 0.27, s * 0.08, s * 0.11, 0, 0, Math.PI * 2);
    } else if (mood === 'worried') {
      ctx.moveTo(x - s * 0.16, fy + s * 0.32);
      ctx.quadraticCurveTo(x, fy + s * 0.2, x + s * 0.16, fy + s * 0.32);
      // brows
      ctx.moveTo(x - s * 0.4, fy - s * 0.2); ctx.lineTo(x - s * 0.18, fy - s * 0.27);
      ctx.moveTo(x + s * 0.4, fy - s * 0.2); ctx.lineTo(x + s * 0.18, fy - s * 0.27);
    } else {
      const wide = mood === 'proud' ? 0.24 : 0.18;
      ctx.moveTo(x - s * wide, fy + s * 0.2);
      ctx.quadraticCurveTo(x, fy + s * (0.36 + 0.04 * Math.sin(t * 6)), x + s * wide, fy + s * 0.2);
    }
    ctx.stroke();
    ctx.restore();
  }
}

/** The sky behind every story: a gradient, three torn bands of hill, and the
 *  crescent moon (night) or a paper sun (day). Drawn once per size and theme. */
export function drawBackdrop(ctx: CanvasRenderingContext2D, W: number, H: number, c: Colors, grain: CanvasPattern | null) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, c.sky);
  g.addColorStop(1, c.skyLow);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // the sun sits behind the hills, so it comes first
  if (c.mode === 'day') {
    // on a phone the narrator takes the top left corner: the sun moves right
    const narrow = W < 560;
    const sx = narrow ? W * 0.62 : W * 0.08, sy = narrow ? H * 0.11 : H * 0.17, sr = Math.min(W, H) * 0.06;
    ctx.save();
    ctx.fillStyle = c.star;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(a);
      ctx.beginPath();
      ctx.moveTo(sr * 1.18, -sr * 0.12);
      ctx.lineTo(sr * 1.62, 0);
      ctx.lineTo(sr * 1.18, sr * 0.12);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = c.fibre;
    tornCircle(ctx, sx, sy, sr + 2.5, 71, 1.5);
    ctx.fill();
    ctx.fillStyle = c.star;
    tornCircle(ctx, sx, sy, sr, 72, 1.3);
    ctx.fill();
    if (grain) { ctx.globalAlpha = 0.4; ctx.fillStyle = grain; ctx.fill(); }
    ctx.restore();
  }
  const bands: [number, string, number][] = [[0.42, c.band1, 11], [0.62, c.band2, 23], [0.8, c.band3, 37]];
  for (const [f, color, seed] of bands) {
    const r = rng(seed);
    const y0 = H * f;
    const pts: [number, number][] = [];
    for (let x = -10; x <= W + 10; x += 9) {
      const wave = Math.sin(x / (W / 3.2) + seed) * H * 0.035;
      pts.push([x, y0 + wave + (r() - 0.5) * 4]);
    }
    // the white torn fibre, then the band
    ctx.fillStyle = c.fibre;
    ctx.beginPath();
    ctx.moveTo(-10, H + 10);
    pts.forEach(([x, y]) => ctx.lineTo(x, y - 2.2 - r() * 1.6));
    ctx.lineTo(W + 10, H + 10);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-10, H + 10);
    pts.forEach(([x, y]) => ctx.lineTo(x, y));
    ctx.lineTo(W + 10, H + 10);
    ctx.closePath();
    ctx.fill();
    if (grain) { ctx.save(); ctx.globalAlpha = 0.35; ctx.fillStyle = grain; ctx.fill(); ctx.restore(); }
  }
  if (c.mode === 'night') {
    // crescent moon, top left
    const narrow = W < 560;
    const mx = narrow ? W * 0.62 : W * 0.08, my = narrow ? H * 0.11 : H * 0.16, mr = Math.min(W, H) * 0.06;
    ctx.fillStyle = c.paper;
    ctx.beginPath();
    ctx.arc(mx, my, mr, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = c.sky;
    ctx.beginPath();
    ctx.arc(mx + mr * 0.45, my - mr * 0.2, mr * 0.88, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** A tile of paper grain: random specks, used as a pattern over every paper shape. */
export function makeGrain(): HTMLCanvasElement {
  const g = document.createElement('canvas');
  g.width = g.height = 96;
  const x = g.getContext('2d')!;
  const r = rng(99);
  for (let i = 0; i < 900; i++) {
    x.fillStyle = r() > 0.5 ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.08)';
    x.fillRect(r() * 96, r() * 96, 1 + r() * 1.4, 1 + r() * 1.4);
  }
  return g;
}

/** What moves in the sky, seeded so it is the same sky every frame: stars
 *  that twinkle at night, a few torn clouds drifting by day. */
export function drawSky(p: Painter) {
  if (p.c.mode === 'day') {
    const r = rng(17);
    const n = p.narrow ? 3 : 5;
    for (let i = 0; i < n; i++) {
      const s = (p.narrow ? 12 : 16) + r() * 14;
      const speed = 0.004 + r() * 0.006; // px per ms
      const loop = p.W + 4 * s;
      const x = ((r() * loop + p.now * speed) % loop) - 2 * s;
      const y = p.H * (0.06 + r() * 0.24);
      p.cloud(x, y, s, 400 + i * 9, 0.92);
    }
    return;
  }
  const r = rng(7);
  const n = p.narrow ? 14 : 26;
  for (let i = 0; i < n; i++) {
    const x = r() * p.W;
    const y = r() * p.H * 0.4;
    const size = 2 + r() * 4;
    const tw = 0.55 + 0.45 * Math.sin(p.now / (600 + r() * 900) + i);
    if (r() > 0.35) p.star(x, y, size, p.c.star, tw);
    else {
      p.ctx.save();
      p.ctx.globalAlpha = tw * 0.8;
      p.ctx.strokeStyle = p.c.paper;
      p.ctx.lineWidth = 1.2;
      p.ctx.beginPath();
      p.ctx.moveTo(x - size, y); p.ctx.lineTo(x + size, y);
      p.ctx.moveTo(x, y - size); p.ctx.lineTo(x, y + size);
      p.ctx.stroke();
      p.ctx.restore();
    }
  }
}

/** The old name, kept for the copies of this file that still call it. */
export const drawStars = drawSky;
