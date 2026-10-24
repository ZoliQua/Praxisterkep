// The prevention chain, animated: the same patient (mustard sweater) through
// four steps when the district has a doctor ("Van háziorvos") and four when
// it has none ("Nincs háziorvos"), for a GP or a dental district as the
// global switch says. The picture is drawn in cut paper on the stories'
// engine (components/story); the step's title and description stay HTML
// beside it, so they read the same in both themes and to a screen reader.
// With reduced motion each step is shown finished and nothing moves on by
// itself.
import { useCallback, useEffect, useRef, useState } from 'react';
import { t } from '../lib/i18n';
import { formatNumber } from '../lib/format';
import { useAppStore, useSnapshot } from '../store/useAppStore';
import { useStoryCanvas } from './story/useStoryCanvas';
import { drawPrevention, type Variant } from './story/prevention';
import type { Painter } from './story/paint';
import './story/story.css';

const SCENE_MS = 6800;
/** the share of a step spent drawing itself in; the rest is the idle loop */
const PLAY_IN = 0.6;

function stageHeight(w: number): number {
  return w < 560 ? Math.max(250, w * 0.8) : Math.max(280, Math.min(380, w * 0.4));
}

function prefersReduced(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function PreventionStory() {
  const kind = useAppStore((s) => s.kind);
  const snapshot = useSnapshot();
  const [variant, setVariant] = useState<Variant>('ok');
  const [scene, setScene] = useState(0);
  // bumped on every manual selection so the auto-advance timer restarts
  // instead of overriding the user's choice a moment later
  const [timerGen, setTimerGen] = useState(0);
  const [reduced] = useState(prefersReduced);
  const sceneStart = useRef(0);

  useEffect(() => {
    if (reduced) return undefined;
    const id = window.setInterval(() => setScene((s) => (s + 1) % 4), SCENE_MS);
    return () => window.clearInterval(id);
  }, [variant, timerGen, reduced]);

  // every step draws itself in from its own start
  useEffect(() => {
    sceneStart.current = performance.now();
  }, [scene, variant, kind, timerGen]);

  function switchVariant(v: Variant) {
    setVariant(v);
    setScene(0);
    setTimerGen((g) => g + 1);
  }

  function selectScene(i: number) {
    setScene(i);
    setTimerGen((g) => g + 1);
  }

  // the story follows the global dental/GP toggle
  const [shownKind, setShownKind] = useState(kind);
  if (shownKind !== kind) {
    setShownKind(kind);
    setVariant('ok');
    setScene(0);
    setTimerGen((g) => g + 1);
  }

  const draw = useCallback((p: Painter) => {
    const local = reduced ? 1 : (p.now - sceneStart.current) / (SCENE_MS * PLAY_IN);
    drawPrevention(p, kind, variant, scene, local);
  }, [kind, variant, scene, reduced]);
  const { wrap, canvas, size } = useStoryCanvas(draw, { animate: !reduced, still: reduced, height: stageHeight });

  const chainKey = kind === 'dental'
    ? (variant === 'ok' ? 'chainOkDental' : 'chainBrokenDental')
    : (variant === 'ok' ? 'chainOk' : 'chainBroken');
  const titles = [0, 1, 2, 3].map((i) => t(`why.${chainKey}.${i}`));
  const descs = [0, 1, 2, 3].map((i) => t(`why.${chainKey}Desc.${i}`));
  const toggleOk = t(kind === 'dental' ? 'why.storyToggleOkDental' : 'why.storyToggleOk');
  const toggleBroken = t(kind === 'dental' ? 'why.storyToggleBrokenDental' : 'why.storyToggleBroken');

  return (
    <div className={`story ${variant === 'broken' ? 'story--broken' : ''}`}>
      <div className="story__switch" role="group">
        <span className={`story__thumb ${variant === 'broken' ? 'is-right' : ''}`} aria-hidden="true" />
        <button aria-pressed={variant === 'ok'} onClick={() => switchVariant('ok')}>
          {toggleOk}
        </button>
        <button aria-pressed={variant === 'broken'} onClick={() => switchVariant('broken')}>
          {toggleBroken}
        </button>
      </div>

      {/* The section is called a chain, so it is drawn as one: four named
          links, joined, filling up to where the story has got to. */}
      <ol className="story__chain">
        {titles.map((title, i) => (
          <li key={title}
            className={`${i === scene ? 'is-active' : ''} ${i < scene ? 'is-done' : ''}`}>
            <button onClick={() => selectScene(i)}
              aria-current={i === scene ? 'step' : undefined}>
              <span className="story__chain-dot">{i + 1}</span>
              <span className="story__chain-label">{title}</span>
            </button>
          </li>
        ))}
      </ol>

      <div className="story__stage cutstory-tokens">
        {/* restarts on every scene change, so the wait before the next one is
            visible instead of feeling like a random jump */}
        <span className="story__timer" key={`t-${variant}-${scene}-${timerGen}`}
          style={{ animationDuration: `${SCENE_MS}ms` }} aria-hidden="true" />
        <div className="story__caption" key={`${variant}-${scene}`}>
          <h4>{titles[scene]}</h4>
          <p>{descs[scene]}</p>
        </div>
        <div ref={wrap}>
          <canvas ref={canvas} role="img" aria-label={`${titles[scene]}: ${descs[scene]}`}
            style={{ width: size.w || '100%', height: size.h || 280 }} />
        </div>
      </div>

      {/* The chain is an illustration, so it ends on the measured thing it
          illustrates: how many districts are on each side of it today. Both
          numbers come from the snapshot — nothing here is drawn from the air. */}
      {snapshot && (variant === 'broken' || snapshot.national.totalDistricts) && (
        <p className="story__tie">
          {variant === 'broken'
            ? t('why.storyTieBroken', {
              count: formatNumber(snapshot.national.vacant),
              people: formatNumber(snapshot.national.populationVacant),
              kind: t(`kinds.${kind}.adj`),
            })
            : t('why.storyTieOk', {
              count: formatNumber((snapshot.national.totalDistricts ?? 0)
                - snapshot.national.vacant),
              total: formatNumber(snapshot.national.totalDistricts ?? 0),
              kind: t(`kinds.${kind}.adj`),
            })}
        </p>
      )}
    </div>
  );
}
