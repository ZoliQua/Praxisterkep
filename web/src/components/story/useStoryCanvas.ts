// The canvas side of a cut-paper animation, shared by the page stories
// (Story.tsx) and the prevention chain (PreventionStory.tsx): it sizes the
// canvas to its column, keeps the sky backdrop cached per size and theme,
// waits for the hand font, and draws frames — every frame while something
// moves, a slow tick otherwise (the stars twinkle, the clouds drift), and
// nothing at all while the canvas is off screen.
import { useCallback, useEffect, useRef, useState } from 'react';
import '@fontsource/patrick-hand/latin-400.css';
import '@fontsource/patrick-hand/latin-ext-400.css';
import { formatNumber, formatPercent } from '../../lib/format';
import { useThemeTick } from '../../lib/theme';
import type { NumberFormat, Painter } from './paint';
import { StoryCanvas, loadHandFont } from './canvasFrame';

/** The numbers the pictures write themselves, in the page's locale. */
const FORMAT: NumberFormat = {
  num: (v) => formatNumber(Math.round(v)),
  pct: (v) => formatPercent(v, 0),
};

export interface StoryCanvasOptions {
  /** draw continuously (a scene is playing) rather than on the slow tick */
  animate: boolean;
  /** canvas height for a given width */
  height: (w: number) => number;
  /** called once, the first time at least half of the canvas is in view */
  onSeen?: () => void;
  /** reduced motion: draw a still frame when something changes, never a loop */
  still?: boolean;
}

export function useStoryCanvas(draw: (p: Painter, wall: number) => void, { animate, height, onSeen, still = false }: StoryCanvasOptions) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [visible, setVisible] = useState(false);
  const painter = useRef<StoryCanvas | null>(null);
  const themeTick = useThemeTick();
  const [fontsTick, setFontsTick] = useState(0);
  const heightRef = useRef(height);
  const seenRef = useRef(onSeen);
  useEffect(() => {
    heightRef.current = height;
    seenRef.current = onSeen;
  });

  // size: the width of the column
  useEffect(() => {
    const el = wrap.current;
    if (!el) return undefined;
    const set = () => {
      const w = Math.floor(el.getBoundingClientRect().width);
      setSize({ w, h: Math.round(heightRef.current(w)) });
    };
    set();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // a canvas does not ask for a web font the way text does: ask for the hand
  // font (both halves — ő and ű live in latin-ext) and draw again once here
  useEffect(() => { loadHandFont(() => setFontsTick((n) => n + 1)); }, []);

  // on screen or not; and the first real sight of it
  useEffect(() => {
    const el = wrap.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setVisible(true); seenRef.current?.(); return undefined; }
    let seen = false;
    const io = new IntersectionObserver(([e]) => {
      setVisible(e.isIntersecting);
      if (!seen && e.intersectionRatio >= 0.5) { seen = true; seenRef.current?.(); }
    }, { threshold: [0, 0.5] });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const frame = useCallback((wall: number) => {
    const cv = canvas.current;
    if (!cv || !size.w) return;
    if (!painter.current) painter.current = new StoryCanvas();
    painter.current.render(cv, size.w, size.h, themeTick, FORMAT, (p) => draw(p, wall), wall);
    void fontsTick; // a new font means a new frame
  }, [size, themeTick, fontsTick, draw]);

  useEffect(() => {
    if (still) { frame(0); return undefined; }
    if (!visible) { frame(performance.now()); return undefined; }
    let raf = 0;
    let last = 0;
    const loop = (now: number) => {
      if (animate || now - last > 90) { frame(now); last = now; }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [frame, animate, visible, still]);

  return { wrap, canvas, size, visible };
}
