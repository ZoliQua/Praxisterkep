// The playback of a story, without React: how long each scene lasts, which
// scene a moment falls in, and what one frame shows (the narrator, the
// scene's picture, its line on the torn note, the counter). Story.tsx drives
// it with React state; the static settlement pages drive it from plain DOM
// (staticStory.ts). Nothing here reads i18n — the one word it writes, the
// counter, comes in from the caller.
import type { Painter } from './paint';

export type Mood = 'happy' | 'worried' | 'surprised' | 'proud';
export type Mascot = 'tooth' | 'house';
export type Scene = {
  /** the handwritten line, the scene's one statement */
  say: string;
  /** milliseconds; by default the story is spread over about thirty seconds */
  dur?: number;
  mood?: Mood;
  /** the narrator of this scene, when it is not the story's own */
  mascot?: Mascot;
  /** draws the scene's picture; t runs 0 → 1 over the scene */
  draw: (p: Painter, t: number) => void;
};

const TARGET = 30000;
/** the share of a scene spent writing its line out */
export const WRITE = 0.42;

/** a picture-book ratio, never too low or too tall */
export function storyHeight(w: number): number {
  return Math.max(330, Math.min(460, w * (w < 560 ? 1.05 : 0.42)));
}

function defaultDur(n: number): number {
  return Math.round(Math.max(3600, Math.min(4300, TARGET / Math.max(1, n))));
}

export interface Timeline { durs: number[]; starts: number[]; total: number }

export function timeline(scenes: { dur?: number }[]): Timeline {
  const fallback = defaultDur(scenes.length);
  const durs = scenes.map((s) => s.dur ?? fallback);
  const starts = durs.map((_, i) => durs.slice(0, i).reduce((a, b) => a + b, 0));
  return { durs, starts, total: durs.reduce((a, b) => a + b, 0) };
}

/** The scene playing at `time` ms (the last one past the end). */
export function sceneAt(time: number, tl: Timeline): number {
  const i = tl.starts.findIndex((s, k) => time >= s && time < s + tl.durs[k]);
  return i < 0 ? Math.max(0, tl.starts.length - 1) : i;
}

/** How far into scene `i` the story is at `time`, 0 → 1. */
export function sceneProgress(time: number, i: number, tl: Timeline): number {
  return Math.min(1, Math.max(0, (time - tl.starts[i]) / tl.durs[i]));
}

/** The time a jump to scene `i` lands on: its start, or with reduced motion its finished frame. */
export function jumpTime(i: number, tl: Timeline, still: boolean): number {
  return still ? tl.starts[i] + tl.durs[i] - 1 : tl.starts[i];
}

/** One frame: the narrator, the scene's picture, its line on the note, the counter top right. */
export function drawStoryFrame(p: Painter, scenes: Scene[], mascot: Mascot, time: number, tl: Timeline,
  counter: (i: number, n: number) => string): void {
  if (!scenes.length) return;
  const i = sceneAt(time, tl);
  const local = sceneProgress(time, i, tl);
  const sc = scenes[i];
  p.mascot(sc.mascot ?? mascot, sc.mood ?? 'happy', local);
  p.ctx.save();
  try {
    sc.draw(p, local);
  } catch {
    // a picture that cannot be drawn leaves the line on its own
  }
  p.ctx.restore();
  p.note(sc.say, local / WRITE);
  p.text(counter(i + 1, scenes.length), p.W - 14, 22, { size: 12, color: p.c.dim, align: 'right' });
}

/** True when the reader asked the system for less motion. */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
