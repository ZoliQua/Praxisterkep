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
import { Painter, drawBackdrop, drawSky, makeGrain, readColors, type NumberFormat } from './paint';

const HAND = '"Patrick Hand"';

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
  const backdrop = useRef<{ key: string; canvas: HTMLCanvasElement } | null>(null);
  const grain = useRef<HTMLCanvasElement | null>(null);
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
  useEffect(() => {
    const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
    if (!fonts?.load) return;
    void Promise.all([fonts.load(`23px ${HAND}`, 'Aa'), fonts.load(`23px ${HAND}`, 'őű')])
      .then(() => setFontsTick((n) => n + 1)).catch(() => {});
  }, []);

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
    const dpr = window.devicePixelRatio || 1;
    if (cv.width !== Math.round(size.w * dpr) || cv.height !== Math.round(size.h * dpr)) {
      cv.width = Math.round(size.w * dpr);
      cv.height = Math.round(size.h * dpr);
    }
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const colors = readColors(cv);
    if (!grain.current) grain.current = makeGrain();
    const key = `${size.w}x${size.h}x${dpr}x${themeTick}x${colors.mode}x${colors.sky}`;
    if (!backdrop.current || backdrop.current.key !== key) {
      const b = document.createElement('canvas');
      b.width = cv.width; b.height = cv.height;
      const bx = b.getContext('2d')!;
      bx.scale(dpr, dpr);
      drawBackdrop(bx, size.w, size.h, colors, bx.createPattern(grain.current, 'repeat'));
      backdrop.current = { key, canvas: b };
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(backdrop.current.canvas, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cs = getComputedStyle(cv);
    const fonts = {
      hand: cs.getPropertyValue('--story-font-hand').trim() || `${HAND}, cursive`,
      body: cs.getPropertyValue('--font-body').trim() || 'sans-serif',
      display: cs.getPropertyValue('--font-display').trim() || 'sans-serif',
    };
    const p = new Painter(ctx, size.w, size.h, colors, fonts, ctx.createPattern(grain.current, 'repeat'), wall, FORMAT);
    drawSky(p);
    ctx.save();
    try {
      draw(p, wall);
    } catch {
      // a picture that cannot be drawn leaves the sky on its own
    }
    ctx.restore();
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
