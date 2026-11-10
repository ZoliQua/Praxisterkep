// The animated story at the top of a page: about thirty seconds of cut-paper
// scenes, each one number from the page told in one handwritten line, drawn
// frame by frame on a canvas (paint.ts). It plays once when it first comes
// into view, then waits on its last frame; the reader can pause, replay or
// jump to a scene. With reduced motion it shows each scene's finished frame
// and moves on only when asked. The lines are also listed as text under the
// picture, for a screen reader and for anyone who wants them.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './story.css';
import { t } from '../../lib/i18n';
import { formatNumber } from '../../lib/format';
import type { Painter } from './paint';
import { useStoryCanvas } from './useStoryCanvas';
import {
  drawStoryFrame, jumpTime, prefersReducedMotion, sceneAt, storyHeight, timeline,
  type Mascot, type Scene,
} from './player';

export type { Mood, Mascot, Scene } from './player';

export function Story({ title, mascot, scenes }: { title: string; mascot: Mascot; scenes: Scene[] }) {
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0); // ms into the story
  const started = useRef(false);
  const reduced = useRef(false);
  const [still, setStill] = useState(false);

  const tl = useMemo(() => timeline(scenes), [scenes]);
  const { durs, starts, total } = tl;

  useEffect(() => {
    reduced.current = prefersReducedMotion();
    if (reduced.current) { setTime(jumpTime(0, tl, true)); setStill(true); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // the clock
  useEffect(() => {
    if (!playing) return undefined;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      setTime((v) => {
        const next = v + dt;
        if (next >= total) { setPlaying(false); return total - 1; }
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, total]);

  // one frame: the narrator, the scene's picture, its line on the note
  const draw = useCallback((p: Painter) => {
    drawStoryFrame(p, scenes, mascot, time, tl, (i, n) => t('story.ui.counter', { i, n }));
  }, [scenes, mascot, time, tl]);

  // play once on first sight; a story off screen stops
  const { wrap, canvas, size, visible } = useStoryCanvas(draw, {
    animate: playing,
    still,
    height: storyHeight,
    onSeen: () => { if (!started.current && !reduced.current) { started.current = true; setPlaying(true); } },
  });
  useEffect(() => { if (!visible) setPlaying(false); }, [visible]);

  if (!scenes.length) return null;
  const scene = sceneAt(time, tl);
  const jump = (i: number) => {
    setTime(jumpTime(i, tl, reduced.current));
    if (!reduced.current) setPlaying(true);
    started.current = true;
  };
  const toggle = () => {
    started.current = true;
    if (reduced.current) { jump((scene + 1) % scenes.length); return; }
    if (playing) setPlaying(false);
    else { if (time >= total - 2) setTime(0); setPlaying(true); }
  };
  const playLabel = reduced.current ? t('story.ui.next') : playing ? t('story.ui.pause') : t('story.ui.play');

  return (
    <section className="cutstory" data-export="skip" aria-label={t('story.ui.region', { title })}>
      <div className="cutstory__frame" ref={wrap}>
        <canvas ref={canvas} style={size.w ? { width: size.w, height: size.h } : undefined} role="img"
          aria-label={t('story.ui.aria', { title, n: scenes.length })}
          onClick={toggle} />
        <div className="cutstory__controls">
          <button type="button" onClick={toggle} className="cutstory__play" aria-label={playLabel} title={playLabel}>
            {playing ? (
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
            )}
          </button>
          <button type="button" onClick={() => jump(0)} className="cutstory__play" aria-label={t('story.ui.replay')} title={t('story.ui.replay')}>
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4" /></svg>
          </button>
          <div className="cutstory__track">
            {scenes.map((s, i) => {
              const f = i < scene ? 1 : i > scene ? 0 : Math.min(1, (time - starts[i]) / durs[i]);
              return (
                <button key={i} type="button" className="cutstory__seg" style={{ flex: durs[i] }} onClick={() => jump(i)}
                  aria-label={t('story.ui.scene', { i: i + 1, say: s.say })} title={s.say}>
                  <i style={{ width: `${f * 100}%` }} />
                </button>
              );
            })}
          </div>
          <span className="cutstory__time">{t('story.ui.time', {
            now: formatNumber(Math.floor(time / 1000)), total: formatNumber(Math.round(total / 1000)) })}</span>
        </div>
      </div>
      <details className="cutstory__script">
        <summary>{t('story.ui.script')}</summary>
        <ol>{scenes.map((s, i) => <li key={i}>{s.say}</li>)}</ol>
      </details>
    </section>
  );
}

/** The story's place, held while its data is still on the way: the same frame,
 *  controls and script line, empty, so the page under it does not jump when
 *  the story arrives. */
export function StoryPending() {
  return (
    <section className="cutstory cutstory--pending" data-export="skip" aria-hidden="true">
      <div className="cutstory__frame">
        <div className="cutstory__stage" />
        <div className="cutstory__controls">
          <span className="cutstory__play" />
          <span className="cutstory__play" />
          <div className="cutstory__track" />
        </div>
      </div>
      <div className="cutstory__script">&nbsp;</div>
    </section>
  );
}
