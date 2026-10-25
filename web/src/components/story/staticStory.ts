// The story of a static settlement page, without React. The generator
// (scripts/settlement-story.mjs, called by settlement-pages.mjs) writes the
// scenes into the page as JSON — every line already worded, every number
// already read from the settlement's profile — and names each scene's
// picture with one of the recurring shapes of scenes.ts. This module turns
// that into scenes and plays them on the same engine as Story.tsx
// (player.ts, canvasFrame.ts, paint.ts): plays once on first sight, stops
// off screen, a still frame per scene with reduced motion.
//
// It is the lazy half: src/storyStatic.ts loads it only when the story is
// about to scroll into view, so the hand font and the canvas code never
// weigh on a page nobody scrolls.
import './story.css';
import '@fontsource/patrick-hand/latin-400.css';
import '@fontsource/patrick-hand/latin-ext-400.css';
import type { Colors, NumberFormat, Painter } from './paint';
import { StoryCanvas, loadHandFont } from './canvasFrame';
import {
  drawStoryFrame, jumpTime, prefersReducedMotion, sceneAt, sceneProgress, storyHeight, timeline,
  type Mascot, type Mood, type Scene,
} from './player';
import { bars, bigNumber, columns, donut, houses, people, waffle } from './scenes';

/* ------------------------------------------------------------ the data */

/** A colour of the story: one of the painter's tokens, never a literal. */
export type Tone = 'accent' | 'gp' | 'dental' | 'alert' | 'soft' | 's2' | 's3' | 's5' | 'track' | 'paper';
/** How a picture writes its own numbers: decimals, a unit after, a word for zero. */
export type Fmt = { d?: number; pct?: boolean; suffix?: string; zero?: string };
export type Pic =
  | { t: 'big'; v: number; fmt?: Fmt; label?: string; tone?: Tone }
  | { t: 'waffle'; parts: { n: number; tone: Tone; label: string }[]; total: number }
  | { t: 'houses'; tones: Tone[] }
  | { t: 'bars'; items: { label: string; value: number; tone: Tone }[]; fmt?: Fmt; ref?: { label: string; value: number } }
  | { t: 'columns'; items: { label: string; value: number; tone: Tone }[]; fmt?: Fmt }
  | { t: 'donut'; share: number; tone: Tone; label?: string }
  | { t: 'people'; n: number; lit: number; tone: Tone };
export type SceneSpec = { say: string; mood?: Mood; mascot?: Mascot; pic: Pic };
export interface StoryUi {
  region: string; aria: string; play: string; pause: string; next: string; replay: string;
  /** "{i}. jelenet: {say}" */
  scene: string;
  /** "{now} / {total} mp" */
  time: string;
  /** "{i} / {n}" */
  counter: string;
}
export interface StoryData {
  /** a BCP 47 tag for the numbers the pictures write: hu-HU or en-GB */
  locale: string;
  mascot: Mascot;
  ui: StoryUi;
  scenes: SceneSpec[];
}

const fill = (s: string, v: Record<string, string | number>) =>
  s.replace(/\{(\w+)\}/g, (m, k: string) => (k in v ? String(v[k]) : m));

export function formatter(locale: string, f: Fmt = {}): (v: number) => string {
  const d = f.d ?? 0;
  const nf = new Intl.NumberFormat(locale, { minimumFractionDigits: d, maximumFractionDigits: d });
  return (v) => {
    if (f.zero !== undefined && Math.abs(v) < 1e-9) return f.zero;
    return f.pct ? `${nf.format(v * 100)}%` : `${nf.format(v)}${f.suffix ?? ''}`;
  };
}

const tone = (p: Painter, t: Tone): string => p.c[t as keyof Colors] as string;

/** One picture spec, drawn with the shapes every other story uses. */
export function drawPic(p: Painter, pic: Pic, t: number, locale: string): void {
  switch (pic.t) {
    case 'big':
      bigNumber(p, pic.v, formatter(locale, pic.fmt), t, { label: pic.label, color: tone(p, pic.tone ?? 'accent') });
      return;
    case 'waffle':
      waffle(p, pic.parts.map((x) => ({ n: x.n, color: tone(p, x.tone), label: x.label })), pic.total, t);
      return;
    case 'houses':
      houses(p, pic.tones.map((x) => tone(p, x)), t);
      return;
    case 'bars':
      bars(p, pic.items.map((x) => ({ label: x.label, value: x.value, color: tone(p, x.tone) })),
        formatter(locale, pic.fmt), t, pic.ref ? { ref: pic.ref } : {});
      return;
    case 'columns':
      columns(p, pic.items.map((x) => ({ label: x.label, value: x.value, color: tone(p, x.tone) })), formatter(locale, pic.fmt), t);
      return;
    case 'donut':
      donut(p, pic.share, t, tone(p, pic.tone), { label: pic.label });
      return;
    case 'people':
      people(p, pic.n, pic.lit, t, tone(p, pic.tone));
      return;
    default:
  }
}

export function toScenes(data: StoryData): Scene[] {
  return data.scenes.map((s) => ({
    say: s.say, mood: s.mood, mascot: s.mascot,
    draw: (p: Painter, t: number) => drawPic(p, s.pic, t, data.locale),
  }));
}

/* ------------------------------------------------------------ the DOM */

const SVG_PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
const SVG_PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>';
const SVG_REPLAY = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4"/></svg>';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}

/** Plays `data` in `frame` (a .cutstory__frame element, empty or holding a placeholder). */
export function mountStory(frame: HTMLElement, data: StoryData): void {
  const scenes = toScenes(data);
  if (!scenes.length) return;
  const { ui, mascot } = data;
  const tl = timeline(scenes);
  const nf = new Intl.NumberFormat(data.locale);
  const format: NumberFormat = { num: (v) => nf.format(Math.round(v)), pct: formatter(data.locale, { pct: true }) };
  const painter = new StoryCanvas();
  const reduced = prefersReducedMotion();

  let time = reduced ? jumpTime(0, tl, true) : 0;
  let playing = false;
  let started = false;
  let visible = false;
  let w = 0;
  let h = 0;
  let themeTick = 0;

  // the canvas and the controls, the same markup as Story.tsx
  frame.replaceChildren();
  frame.style.removeProperty('height');
  const canvas = el('canvas');
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', ui.aria);
  const controls = el('div', 'cutstory__controls');
  const play = el('button', 'cutstory__play');
  play.type = 'button';
  const replay = el('button', 'cutstory__play');
  replay.type = 'button';
  replay.innerHTML = SVG_REPLAY;
  replay.setAttribute('aria-label', ui.replay);
  replay.title = ui.replay;
  const track = el('div', 'cutstory__track');
  const fills = scenes.map((s, i) => {
    const seg = el('button', 'cutstory__seg');
    seg.type = 'button';
    seg.style.flex = String(tl.durs[i]);
    seg.setAttribute('aria-label', fill(ui.scene, { i: i + 1, say: s.say }));
    seg.title = s.say;
    const bar = el('i');
    seg.append(bar);
    seg.addEventListener('click', () => jump(i));
    track.append(seg);
    return bar;
  });
  const clock = el('span', 'cutstory__time');
  controls.append(play, replay, track, clock);
  frame.append(canvas, controls);

  let shownPlaying: boolean | null = null;
  const sync = () => {
    if (shownPlaying !== playing) {
      shownPlaying = playing;
      play.innerHTML = playing ? SVG_PAUSE : SVG_PLAY;
      const label = reduced ? ui.next : playing ? ui.pause : ui.play;
      play.setAttribute('aria-label', label);
      play.title = label;
    }
    const cur = sceneAt(time, tl);
    fills.forEach((bar, i) => {
      const f = i < cur ? 1 : i > cur ? 0 : sceneProgress(time, i, tl);
      bar.style.width = `${f * 100}%`;
    });
    clock.textContent = fill(ui.time, { now: nf.format(Math.floor(time / 1000)), total: nf.format(Math.round(tl.total / 1000)) });
  };

  const counter = (i: number, n: number) => fill(ui.counter, { i, n });
  const draw = (wall: number) => {
    painter.render(canvas, w, h, themeTick, format, (p) => drawStoryFrame(p, scenes, mascot, time, tl, counter), wall);
    sync();
  };

  // the clock and the frames: every frame while playing, a slow tick otherwise
  // (the stars twinkle), nothing off screen, and with reduced motion only
  // when something changes
  let raf = 0;
  let last = 0;
  let lastDraw = 0;
  const loop = (now: number) => {
    raf = 0;
    if (!visible || reduced) return;
    if (playing) {
      time += last ? now - last : 0;
      if (time >= tl.total) { time = tl.total - 1; playing = false; }
    }
    last = now;
    if (playing || now - lastDraw > 90) { draw(now); lastDraw = now; }
    raf = requestAnimationFrame(loop);
  };
  const kick = () => {
    if (reduced || !visible) { draw(0); return; }
    if (!raf) { last = 0; raf = requestAnimationFrame(loop); }
  };

  const jump = (i: number) => {
    time = jumpTime(i, tl, reduced);
    started = true;
    if (!reduced) playing = true;
    last = 0;
    kick();
    draw(performance.now());
  };
  const toggle = () => {
    started = true;
    if (reduced) { jump((sceneAt(time, tl) + 1) % scenes.length); return; }
    if (playing) playing = false;
    else { if (time >= tl.total - 2) time = 0; playing = true; last = 0; }
    kick();
    draw(performance.now());
  };
  play.addEventListener('click', toggle);
  replay.addEventListener('click', () => jump(0));
  canvas.addEventListener('click', toggle);

  // size: the width of the column
  const resize = () => {
    w = Math.floor(frame.getBoundingClientRect().width);
    h = Math.round(storyHeight(w));
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    draw(performance.now());
  };
  resize();
  if (typeof ResizeObserver !== 'undefined') {
    let lastW = w;
    new ResizeObserver(() => {
      const nw = Math.floor(frame.getBoundingClientRect().width);
      if (nw !== lastW) { lastW = nw; resize(); }
    }).observe(frame);
  }

  // on screen or not; the first real sight of it starts it
  const seen = () => {
    if (!started && !reduced) { started = true; playing = true; last = 0; }
  };
  if (typeof IntersectionObserver === 'undefined') {
    visible = true;
    seen();
    kick();
  } else {
    new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (!visible) playing = false;
      if (e.intersectionRatio >= 0.5) seen();
      kick();
    }, { threshold: [0, 0.5] }).observe(frame);
  }

  // a new theme or colour scheme: the top bar's buttons set them on <html>
  // (watched there rather than through lib/theme, which would bring React
  // into this small bundle)
  new MutationObserver(() => { themeTick += 1; draw(performance.now()); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-palette'] });
  loadHandFont(() => draw(performance.now()));
}

/** Every story host on the page: a [data-story] element with its JSON inside. */
export function mountAll(root: ParentNode = document): void {
  for (const host of root.querySelectorAll<HTMLElement>('[data-story]')) {
    if (host.dataset.storyMounted) continue;
    host.dataset.storyMounted = '1';
    try {
      const json = host.querySelector('script[type="application/json"]')?.textContent ?? '';
      const data = JSON.parse(json) as StoryData;
      let frame = host.querySelector<HTMLElement>('.cutstory__frame');
      if (!frame) {
        frame = el('div', 'cutstory__frame');
        host.prepend(frame);
      }
      mountStory(frame, data);
    } catch {
      // a story that cannot be read leaves its text list, nothing else
    }
  }
}
