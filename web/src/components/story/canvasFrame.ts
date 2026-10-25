// One frame of a cut-paper canvas, without React: sizes the bitmap to the
// device pixel ratio, keeps the sky backdrop cached per size and theme, reads
// the fonts and the colours from the CSS tokens, and hands a Painter to the
// caller's draw. useStoryCanvas.ts (the app) and staticStory.ts (the static
// settlement pages) both draw through it.
import { Painter, drawBackdrop, drawSky, makeGrain, readColors, type NumberFormat } from './paint';

export const HAND = '"Patrick Hand"';

export class StoryCanvas {
  private backdrop: { key: string; canvas: HTMLCanvasElement } | null = null;
  private grain: HTMLCanvasElement | null = null;

  /** Draws one frame on `cv` at `w` × `h` CSS pixels; `themeKey` changes when the theme does. */
  render(cv: HTMLCanvasElement, w: number, h: number, themeKey: string | number, format: NumberFormat,
    draw: (p: Painter) => void, wall: number): void {
    if (!w) return;
    const dpr = window.devicePixelRatio || 1;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
    }
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const colors = readColors(cv);
    if (!this.grain) this.grain = makeGrain();
    const key = `${w}x${h}x${dpr}x${themeKey}x${colors.mode}x${colors.sky}`;
    if (!this.backdrop || this.backdrop.key !== key) {
      const b = document.createElement('canvas');
      b.width = cv.width; b.height = cv.height;
      const bx = b.getContext('2d')!;
      bx.scale(dpr, dpr);
      drawBackdrop(bx, w, h, colors, bx.createPattern(this.grain, 'repeat'));
      this.backdrop = { key, canvas: b };
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.backdrop.canvas, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cs = getComputedStyle(cv);
    const fonts = {
      hand: cs.getPropertyValue('--story-font-hand').trim() || `${HAND}, cursive`,
      body: cs.getPropertyValue('--font-body').trim() || 'sans-serif',
      display: cs.getPropertyValue('--font-display').trim() || 'sans-serif',
    };
    const p = new Painter(ctx, w, h, colors, fonts, ctx.createPattern(this.grain, 'repeat'), wall, format);
    drawSky(p);
    ctx.save();
    try {
      draw(p);
    } catch {
      // a picture that cannot be drawn leaves the sky on its own
    }
    ctx.restore();
  }
}

/** Asks for the hand font — both halves, ő and ű live in latin-ext — and calls back once it is here. */
export function loadHandFont(then: () => void): void {
  const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
  if (!fonts?.load) return;
  void Promise.all([fonts.load(`23px ${HAND}`, 'Aa'), fonts.load(`23px ${HAND}`, 'őű')])
    .then(then).catch(() => {});
}
