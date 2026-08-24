// Animated prevention story: two four-scene sequences ("Van háziorvos" /
// "Nincs háziorvos") on one SVG stage. Scenes cross-fade on an auto-advancing
// loop; every scene carries continuous motion (CSS keyframes, see index.css).
// Captions come from hu.json (why.chainOk/chainBroken + *Desc arrays).
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { t } from '../lib/i18n';

type Variant = 'ok' | 'broken';
const SCENE_MS = 6200;

/* ---------- small shared figures ---------- */

function Head({ cx, cy, r = 15 }: { cx: number; cy: number; r?: number }) {
  return <circle cx={cx} cy={cy} r={r} fill="none" stroke="currentColor" strokeWidth={3} />;
}

/* ---------- scenes: VAN háziorvos ---------- */

function SceneExam() {
  return (
    <g className="ps-scene__art" stroke="var(--ink)" strokeWidth={3}
      strokeLinecap="round" fill="none">
      {/* floor */}
      <line x1={70} y1={262} x2={570} y2={262} stroke="var(--line-strong)" />
      {/* exam table */}
      <g stroke="var(--ink-faint)">
        <rect x={352} y={196} width={150} height={12} rx={4} />
        <line x1={366} y1={208} x2={366} y2={262} />
        <line x1={488} y1={208} x2={488} y2={262} />
      </g>
      {/* patient (breathing) */}
      <g className="ps-breathe">
        <Head cx={412} cy={124} />
        <path d="M412 139 v52" />
        <path d="M412 150 q-14 12 -18 26" />
        <path d="M412 150 q14 12 18 26" />
      </g>
      <path d="M406 196 q2 30 0 60" />
      <path d="M420 196 q4 30 4 60" />
      {/* doctor on stool */}
      <g stroke="var(--ink-faint)">
        <ellipse cx={296} cy={212} rx={20} ry={5} />
        <line x1={296} y1={217} x2={296} y2={262} />
      </g>
      <Head cx={288} cy={116} />
      <path d="M290 131 q6 40 6 76" />
      <path d="M292 150 q-16 8 -22 22" />
      {/* stethoscope: ear tubes + animated chest piece */}
      <path d="M282 124 q-8 22 6 34" stroke="var(--accent)" strokeWidth={2.5} />
      <g className="ps-listen">
        <path d="M288 158 q18 4 34 8" stroke="var(--accent)" strokeWidth={2.5} />
        <circle cx={398} cy={166} r={6.5} fill="var(--accent)" stroke="none" />
      </g>
      {/* heartbeat rings from the chest */}
      <circle className="ps-pulse" cx={400} cy={166} r={10} stroke="var(--accent)" strokeWidth={2} />
      <circle className="ps-pulse ps-pulse--late" cx={400} cy={166} r={10}
        stroke="var(--accent)" strokeWidth={2} />
      {/* ECG strip above */}
      <path className="ps-ecg"
        d="M330 74 h34 l7 -16 l9 30 l8 -14 h36 l7 -16 l9 30 l8 -14 h36"
        stroke="var(--accent)" strokeWidth={2} opacity={0.6} />
    </g>
  );
}

function SceneScreening() {
  return (
    <g className="ps-scene__art" stroke="var(--ink)" strokeWidth={3}
      strokeLinecap="round" fill="none">
      <line x1={70} y1={262} x2={570} y2={262} stroke="var(--line-strong)" />
      {/* patient standing, slight profile */}
      <Head cx={318} cy={104} />
      <path d="M318 119 q4 44 2 78" />
      <path d="M318 132 q-14 16 -16 34" />
      <path d="M318 132 q16 14 20 32" />
      <path d="M318 197 q-8 34 -10 65" />
      <path d="M320 197 q8 34 10 65" />
      {/* the finding on the shoulder */}
      <circle className="ps-spot" cx={331} cy={143} r={5.5}
        fill="var(--alert-soft)" stroke="none" />
      <circle className="ps-spot-ring" cx={331} cy={143} r={11}
        stroke="var(--alert-soft)" strokeWidth={2} />
      {/* sweeping magnifier that settles on the spot */}
      <g className="ps-mag" stroke="var(--accent)">
        <circle cx={331} cy={143} r={24} strokeWidth={3.5}
          fill="color-mix(in srgb, var(--accent) 7%, transparent)" />
        <line x1={349} y1={161} x2={372} y2={186} strokeWidth={5} />
      </g>
    </g>
  );
}

function SceneTreatment() {
  return (
    <g className="ps-scene__art" stroke="var(--ink)" strokeWidth={3}
      strokeLinecap="round" fill="none">
      <line x1={70} y1={262} x2={570} y2={262} stroke="var(--line-strong)" />
      {/* small table with pill bottle + water */}
      <g stroke="var(--ink-faint)">
        <line x1={218} y1={206} x2={288} y2={206} />
        <line x1={228} y1={206} x2={228} y2={262} />
        <line x1={278} y1={206} x2={278} y2={262} />
      </g>
      <g stroke="var(--accent)">
        <rect x={234} y={176} width={20} height={30} rx={3} />
        <rect x={236} y={168} width={16} height={8} rx={2} />
        <path d="M240 191 h8 M244 187 v8" strokeWidth={2.5} />
      </g>
      <path d="M264 184 l3 22 h10 l3 -22 z" stroke="var(--ink-faint)" />
      {/* patient standing, arm raising a pill to the mouth */}
      <Head cx={352} cy={112} />
      <path d="M352 127 v72" />
      <path d="M352 140 q-14 14 -16 32" />
      <g className="ps-arm">
        <path d="M0 0 q16 10 26 26" transform="translate(352 140)" />
      </g>
      <circle className="ps-pill" cx={378} cy={168} r={4.5}
        fill="var(--accent)" stroke="none" />
      <path d="M348 199 q-6 32 -8 63" />
      <path d="M356 199 q6 32 8 63" />
      {/* strengthening heart */}
      <path className="ps-heart"
        d="M352 70 c-5 -8 -17 -6 -17 3 c0 7 9 12 17 18 c8 -6 17 -11 17 -18 c0 -9 -12 -11 -17 -3 z"
        fill="var(--accent)" stroke="none" opacity={0.9} />
    </g>
  );
}

function SceneHealthy() {
  return (
    <g className="ps-scene__art" stroke="var(--ink)" strokeWidth={3}
      strokeLinecap="round" fill="none">
      {/* sun with rotating rays */}
      <g className="ps-sun" stroke="var(--alert-soft)">
        <circle cx={140} cy={86} r={17} fill="var(--alert-soft)" stroke="none" opacity={0.9} />
        {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
          <line key={a} x1={140 + 26 * Math.cos((a * Math.PI) / 180)}
            y1={86 + 26 * Math.sin((a * Math.PI) / 180)}
            x2={140 + 34 * Math.cos((a * Math.PI) / 180)}
            y2={86 + 34 * Math.sin((a * Math.PI) / 180)} strokeWidth={2.5} />
        ))}
      </g>
      {/* rolling meadow */}
      <path d="M60 262 q160 -26 280 -6 q140 22 240 6" stroke="var(--line-strong)" />
      <g stroke="var(--accent)">
        <line x1={506} y1={256} x2={506} y2={216} />
        <circle cx={506} cy={204} r={17} fill="color-mix(in srgb, var(--accent) 14%, transparent)" />
      </g>
      {/* jumping figure, arms in V */}
      <g className="ps-hop">
        <Head cx={330} cy={116} />
        <path d="M330 131 v58" />
        <path d="M330 140 q-18 -12 -26 -26" />
        <path d="M330 140 q18 -12 26 -26" />
        <path d="M326 189 q-10 26 -18 44" />
        <path d="M334 189 q10 26 18 44" />
      </g>
      <path className="ps-heart"
        d="M330 74 c-5 -8 -17 -6 -17 3 c0 7 9 12 17 18 c8 -6 17 -11 17 -18 c0 -9 -12 -11 -17 -3 z"
        fill="var(--alert)" stroke="none" />
      {/* drifting birds */}
      <path className="ps-bird" d="M420 96 q7 -7 14 0 q7 -7 14 0" stroke="var(--ink-dim)" strokeWidth={2} />
      <path className="ps-bird ps-bird--late" d="M470 74 q6 -6 12 0 q6 -6 12 0"
        stroke="var(--ink-dim)" strokeWidth={2} />
    </g>
  );
}

/* ---------- scenes: NINCS háziorvos ---------- */

function SceneVacant() {
  return (
    <g className="ps-scene__art" stroke="var(--ink-faint)" strokeWidth={3}
      strokeLinecap="round" fill="none">
      <line x1={70} y1={262} x2={570} y2={262} stroke="var(--line-strong)" />
      {/* flickering ceiling lamp */}
      <line x1={320} y1={38} x2={320} y2={64} />
      <path className="ps-flicker" d="M320 64 L268 176 h104 z"
        fill="color-mix(in srgb, var(--alert-soft) 8%, transparent)" stroke="none" />
      <path d="M308 64 h24 l-4 10 h-16 z" fill="var(--bg-panel)" />
      {/* the same exam room, empty */}
      <rect x={352} y={196} width={150} height={12} rx={4} />
      <line x1={366} y1={208} x2={366} y2={262} />
      <line x1={488} y1={208} x2={488} y2={262} />
      <ellipse cx={280} cy={212} rx={20} ry={5} />
      <line x1={280} y1={217} x2={280} y2={262} />
      {/* door with a swinging empty sign */}
      <rect x={104} y={112} width={64} height={150} rx={3} />
      <circle cx={158} cy={192} r={3} fill="var(--ink-faint)" stroke="none" />
      <g className="ps-swing">
        <line x1={136} y1={126} x2={136} y2={140} strokeWidth={2} />
        <rect x={116} y={140} width={40} height={20} rx={3}
          stroke="var(--alert)" fill="var(--bg-panel)" />
        <line x1={122} y1={148} x2={150} y2={148} stroke="var(--alert)" strokeWidth={2} />
        <line x1={126} y1={153} x2={146} y2={153} stroke="var(--alert)" strokeWidth={2} />
      </g>
      {/* floating question marks */}
      <text className="ps-q" x={360} y={150} fill="var(--alert-soft)" stroke="none">?</text>
      <text className="ps-q ps-q--d1" x={420} y={168} fill="var(--alert-soft)" stroke="none">?</text>
      <text className="ps-q ps-q--d2" x={310} y={188} fill="var(--alert-soft)" stroke="none">?</text>
    </g>
  );
}

function SceneWandering() {
  return (
    <g className="ps-scene__art" stroke="var(--ink-faint)" strokeWidth={3}
      strokeLinecap="round" fill="none">
      <line x1={70} y1={262} x2={570} y2={262} stroke="var(--line-strong)" />
      {/* two slumped figures pacing */}
      <g className="ps-wander">
        <circle cx={262} cy={130} r={15} />
        <path d="M258 144 q10 26 8 56" />
        <path d="M260 156 q-12 16 -12 32" />
        <path d="M262 156 q12 14 14 30" />
        <path d="M262 200 q-6 32 -8 60" />
        <path d="M268 200 q6 32 8 60" />
        <text className="ps-q ps-q--d1" x={252} y={104} fill="var(--alert-soft)" stroke="none">?</text>
      </g>
      <g className="ps-wander ps-wander--late" opacity={0.7}>
        <circle cx={420} cy={142} r={13} />
        <path d="M416 155 q9 22 7 48" />
        <path d="M418 165 q-10 14 -10 28" />
        <path d="M420 165 q10 12 12 26" />
        <path d="M420 203 q-5 28 -7 57" />
        <path d="M425 203 q5 28 7 57" />
      </g>
      {/* a closed door in the background */}
      <g opacity={0.55}>
        <rect x={520} y={130} width={50} height={132} rx={3} />
        <line x1={530} y1={150} x2={560} y2={150} stroke="var(--alert)" strokeWidth={2} />
      </g>
    </g>
  );
}

function SceneLate() {
  return (
    <g className="ps-scene__art" stroke="var(--ink)" strokeWidth={3}
      strokeLinecap="round" fill="none">
      <line x1={70} y1={262} x2={570} y2={262} stroke="var(--line-strong)" />
      {/* patient bent slightly forward */}
      <Head cx={310} cy={116} />
      <path d="M310 131 q12 36 10 66" />
      <path d="M312 146 q-14 14 -16 32" />
      <path d="M316 146 q14 10 18 28" />
      <path d="M316 197 q-6 34 -8 65" />
      <path d="M322 197 q6 34 8 65" />
      {/* the growing, unnoticed lump on the back */}
      <ellipse className="ps-grow" cx={329} cy={152} rx={12} ry={9}
        fill="var(--alert)" stroke="none" opacity={0.85} />
      <circle className="ps-grow-ring" cx={329} cy={152} r={18}
        stroke="var(--alert)" strokeWidth={2} />
      {/* late alarm */}
      <g className="ps-alarm" stroke="var(--alert)" strokeWidth={4}>
        <line x1={366} y1={92} x2={366} y2={112} />
        <circle cx={366} cy={124} r={2.5} fill="var(--alert)" stroke="none" />
      </g>
      {/* calendar pages hint the passing time */}
      <g className="ps-cal" stroke="var(--ink-faint)" strokeWidth={2.5}>
        <rect x={170} y={110} width={44} height={40} rx={4} />
        <line x1={170} y1={122} x2={214} y2={122} />
        <line x1={182} y1={104} x2={182} y2={114} />
        <line x1={202} y1={104} x2={202} y2={114} />
        <path className="ps-cal-x1" d="M178 130 l8 8 m0 -8 l-8 8" stroke="var(--alert-soft)" />
        <path className="ps-cal-x2" d="M192 130 l8 8 m0 -8 l-8 8" stroke="var(--alert-soft)" />
        <path className="ps-cal-x3" d="M178 142 l8 8 m0 -8 l-8 8" stroke="var(--alert-soft)" />
      </g>
    </g>
  );
}

function SceneHospital() {
  return (
    <g className="ps-scene__art" stroke="var(--ink-faint)" strokeWidth={3}
      strokeLinecap="round" fill="none">
      <line x1={70} y1={262} x2={570} y2={262} stroke="var(--line-strong)" />
      {/* night window */}
      <rect x={120} y={70} width={78} height={64} rx={4} />
      <path d="M172 88 a13 13 0 1 0 4 25 a10 10 0 0 1 -4 -25 z"
        fill="var(--ink-faint)" stroke="none" opacity={0.8} />
      <circle cx={140} cy={112} r={1.6} fill="var(--ink-faint)" stroke="none" />
      <circle cx={152} cy={92} r={1.6} fill="var(--ink-faint)" stroke="none" />
      {/* hospital bed with lying patient */}
      <rect x={252} y={198} width={210} height={16} rx={5} />
      <line x1={262} y1={214} x2={262} y2={262} />
      <line x1={452} y1={214} x2={452} y2={262} />
      <line x1={252} y1={176} x2={252} y2={214} />
      <rect x={262} y={186} width={34} height={12} rx={6} fill="var(--bg-panel)" />
      <circle cx={286} cy={180} r={13} stroke="var(--ink)" />
      <path d="M300 198 q80 -12 158 0" fill="var(--bg-panel)" stroke="var(--ink)" />
      {/* IV stand with a falling drop */}
      <line x1={506} y1={100} x2={506} y2={262} />
      <path d="M492 246 h28" />
      <rect x={496} y={100} width={20} height={30} rx={4} stroke="var(--accent)" />
      <path d="M506 130 q0 30 -22 52" stroke="var(--accent)" strokeWidth={2} />
      <circle className="ps-drip" cx={506} cy={134} r={3}
        fill="var(--accent)" stroke="none" />
      {/* bedside monitor with a slow trace */}
      <rect x={170} y={168} width={62} height={44} rx={4} />
      <line x1={201} y1={212} x2={201} y2={262} />
      <path className="ps-ecg-slow" d="M176 192 h12 l5 -10 l6 18 l5 -8 h22"
        stroke="var(--alert)" strokeWidth={2} />
    </g>
  );
}

/* ---------- the story player ---------- */

const SCENES: Record<Variant, (() => ReactElement)[]> = {
  ok: [SceneExam, SceneScreening, SceneTreatment, SceneHealthy],
  broken: [SceneVacant, SceneWandering, SceneLate, SceneHospital],
};

export function PreventionStory() {
  const [variant, setVariant] = useState<Variant>('ok');
  const [scene, setScene] = useState(0);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;
    timerRef.current = window.setInterval(
      () => setScene((s) => (s + 1) % 4),
      SCENE_MS,
    );
    return () => {
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
    };
  }, [variant]);

  function switchVariant(v: Variant) {
    setVariant(v);
    setScene(0);
  }

  const titles = [0, 1, 2, 3].map((i) =>
    t(`why.${variant === 'ok' ? 'chainOk' : 'chainBroken'}.${i}`));
  const descs = [0, 1, 2, 3].map((i) =>
    t(`why.${variant === 'ok' ? 'chainOkDesc' : 'chainBrokenDesc'}.${i}`));

  return (
    <div className={`story ${variant === 'broken' ? 'story--broken' : ''}`}>
      <div className="story__switch" role="group">
        <span className={`story__thumb ${variant === 'broken' ? 'is-right' : ''}`} aria-hidden="true" />
        <button aria-pressed={variant === 'ok'} onClick={() => switchVariant('ok')}>
          {t('why.storyToggleOk')}
        </button>
        <button aria-pressed={variant === 'broken'} onClick={() => switchVariant('broken')}>
          {t('why.storyToggleBroken')}
        </button>
      </div>

      <div className="story__stage">
        <svg viewBox="0 0 640 300" role="img" aria-label={titles[scene]}>
          {SCENES[variant].map((Scene, i) => (
            <g key={`${variant}-${i}`}
              className={`ps-scene ${i === scene ? 'is-active' : ''}`}>
              <Scene />
            </g>
          ))}
        </svg>
      </div>

      <div className="story__caption" key={`${variant}-${scene}`}>
        <div className="story__steps">
          {titles.map((title, i) => (
            <button key={title} className={i === scene ? 'is-active' : ''}
              onClick={() => setScene(i)} aria-label={title}>
              <span>{i + 1}</span>
            </button>
          ))}
        </div>
        <h4>{titles[scene]}</h4>
        <p>{descs[scene]}</p>
      </div>
    </div>
  );
}
