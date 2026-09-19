// Animated prevention story: two four-scene sequences ("Van háziorvos" /
// "Nincs háziorvos") on one SVG stage, drawn in a flat-illustration style
// (filled characters with faces; limbs are thick rounded strokes in clothing
// colors). The caption overlays the top center of the stage. The SAME patient
// (mustard sweater) is followed through every scene of both arcs.
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { t } from '../lib/i18n';
import { useAppStore } from '../store/useAppStore';
import imgChair from '../assets/story/dental-chair.svg';
import imgPain from '../assets/story/dental-pain.svg';
import imgTreatment from '../assets/story/dental-treatment.svg';
import imgDentist from '../assets/story/dentist-next-to-chair.svg';
import imgSmilingTooth from '../assets/story/smiling-tooth.svg';
import imgToothShape from '../assets/story/tooth-shape.svg';

type Variant = 'ok' | 'broken';
const SCENE_MS = 6800;

/* ---------- palette ---------- */
const SKIN_A = '#e8b48c';   // patient
const SKIN_B = '#d99a6c';   // doctor
const SKIN_C = '#c98f66';   // second patient
const HAIR_A = '#5a4632';   // patient: short brown
const HAIR_B = '#3c434d';   // doctor: dark with grey
const HAIR_C = '#2c2622';   // second patient: black bun
const SWEATER = '#d9a441';
const SWEATER_DARK = '#b8862f';
const JEANS = '#46618f';
const COAT = '#e9eef5';
const COAT_SHADOW = '#c3ceda';
const SCRUB = '#2a9d8f';
const SHOE = '#2b2f38';
const INKF = '#26221f';
const FURN = 'var(--line-strong)';

type Mood = 'calm' | 'happy' | 'sad' | 'worried' | 'asleep';

/* ---------- reusable head ---------- */
function PHead({ x, y, r = 14, skin, hair, mood = 'calm', dir = 1, bun = false }: {
  x: number; y: number; r?: number; skin: string; hair: string;
  mood?: Mood; dir?: 1 | -1; bun?: boolean;
}) {
  const R = r + 1.5;
  const chordY = y - 4;
  const w = Math.sqrt(R * R - (y - chordY) ** 2);
  const ex = x + dir * 6;          // eye x
  const mx = x + dir * 7.5;        // mouth x
  return (
    <g>
      {/* neck */}
      <rect x={x - 4} y={y + r - 3} width={8} height={8} rx={3} fill={skin} />
      <circle cx={x} cy={y} r={r} fill={skin} />
      {/* hair: top cap + nape on the back side */}
      <path d={`M ${x - w} ${chordY} A ${R} ${R} 0 0 1 ${x + w} ${chordY} Z`} fill={hair} />
      <path d={`M ${x - dir * (r - 2)} ${y - 8} q ${-dir * 6} 6 ${-dir * 5} 16 q 4 2 7 0 z`} fill={hair} />
      {bun && <circle cx={x - dir * (r + 3)} cy={y - 6} r={5.5} fill={hair} />}
      {/* ear */}
      <circle cx={x - dir * (r - 3)} cy={y + 3} r={3.2} fill={skin} />
      {/* face */}
      {mood === 'asleep'
        ? <path d={`M ${ex - 3} ${y - 1} q 3 2.5 6 0`} stroke={INKF} strokeWidth={1.8}
            fill="none" strokeLinecap="round" />
        : mood === 'happy'
          ? <path d={`M ${ex - 2.5} ${y - 2.5} q 2.5 -3 5 0`} stroke={INKF} strokeWidth={1.8}
              fill="none" strokeLinecap="round" />
          : <circle cx={ex} cy={y - 2} r={1.9} fill={INKF} />}
      {(mood === 'worried' || mood === 'sad') && (
        <path d={`M ${ex - 3.5} ${y - 8} q 3.5 -2.5 7 -0.5`} stroke={INKF}
          strokeWidth={1.7} fill="none" strokeLinecap="round"
          transform={`rotate(${dir * 8} ${ex} ${y - 8})`} />
      )}
      {mood === 'happy' && (
        <path d={`M ${mx - 4} ${y + 5} q 4 5 8 0`} stroke={INKF} strokeWidth={2}
          fill="none" strokeLinecap="round" />
      )}
      {mood === 'calm' && (
        <path d={`M ${mx - 3} ${y + 6} q 3 2 6 0`} stroke={INKF} strokeWidth={1.8}
          fill="none" strokeLinecap="round" />
      )}
      {(mood === 'sad' || mood === 'asleep') && (
        <path d={`M ${mx - 3} ${y + 7.5} q 3 -2.5 6 0`} stroke={INKF} strokeWidth={1.8}
          fill="none" strokeLinecap="round" />
      )}
      {mood === 'worried' && (
        <line x1={mx - 3} y1={y + 6.5} x2={mx + 3} y2={y + 6.5} stroke={INKF}
          strokeWidth={1.8} strokeLinecap="round" />
      )}
    </g>
  );
}

/* limb = thick rounded stroke */
function Limb({ d, color, w = 11 }: { d: string; color: string; w?: number }) {
  return <path d={d} stroke={color} strokeWidth={w} strokeLinecap="round" fill="none" />;
}
function Hand({ x, y, skin, r = 4.6 }: { x: number; y: number; skin: string; r?: number }) {
  return <circle cx={x} cy={y} r={r} fill={skin} />;
}
function Shoe({ x, y, dir = 1 }: { x: number; y: number; dir?: 1 | -1 }) {
  return <path d={`M ${x - dir * 6} ${y} h ${dir * 17} q ${dir * 3} 0 ${dir * 3} -3.5 q 0 -3.5 ${-dir * 5} -3.5 h ${-dir * 15} z`} fill={SHOE} />;
}

/* ---------- the recurring patient, standing ---------- */
function PatientStanding({ x, mood, armRight = true }: {
  x: number; mood: Mood; armRight?: boolean;
}) {
  const floor = 262;
  return (
    <g>
      <Limb d={`M ${x - 7} 196 L ${x - 9} ${floor - 5}`} color={JEANS} w={12} />
      <Limb d={`M ${x + 7} 196 L ${x + 9} ${floor - 5}`} color={JEANS} w={12} />
      <Shoe x={x - 9} y={floor} dir={-1} />
      <Shoe x={x + 9} y={floor} dir={1} />
      <path d={`M ${x - 15} 138 q 15 -10 30 0 l 4 52 q -19 8 -38 0 z`} fill={SWEATER} />
      <path d={`M ${x - 11} 141 q 11 -7 22 0 l 1 8 q -12 5 -24 0 z`} fill={SWEATER_DARK} opacity={0.5} />
      <Limb d={`M ${x - 11} 146 Q ${x - 17} 168 ${x - 15} 188`} color={SWEATER} w={10} />
      <Hand x={x - 15} y={193} skin={SKIN_A} />
      {armRight && (
        <>
          <Limb d={`M ${x + 11} 146 Q ${x + 17} 168 ${x + 15} 188`} color={SWEATER} w={10} />
          <Hand x={x + 15} y={193} skin={SKIN_A} />
        </>
      )}
      <PHead x={x} y={118} skin={SKIN_A} hair={HAIR_A} mood={mood} dir={1} />
    </g>
  );
}

/* ---------- doctor, standing (clipboard) ---------- */
function DoctorStanding({ x, dir = 1 }: { x: number; dir?: 1 | -1 }) {
  const floor = 262;
  return (
    <g>
      <Limb d={`M ${x - 6} 198 L ${x - 8} ${floor - 5}`} color={SHOE} w={11} />
      <Limb d={`M ${x + 6} 198 L ${x + 8} ${floor - 5}`} color={SHOE} w={11} />
      <Shoe x={x - 8} y={floor} dir={-1} />
      <Shoe x={x + 8} y={floor} dir={1} />
      {/* white coat */}
      <path d={`M ${x - 15} 137 q 15 -10 30 0 l 6 62 q -21 7 -42 0 z`} fill={COAT} />
      <path d={`M ${x + dir * 2} 137 l ${dir * 4} 60`} stroke={COAT_SHADOW} strokeWidth={2} />
      <path d={`M ${x - 6} 138 l 6 10 l 6 -10 z`} fill={SCRUB} />
      {/* stethoscope around the neck */}
      <path d={`M ${x - 6} 140 q 6 12 12 0`} stroke="var(--accent)" strokeWidth={2.6}
        fill="none" strokeLinecap="round" />
      <circle cx={x + dir * 7} cy={152} r={3} fill="var(--accent)" />
      {/* clipboard arm */}
      <Limb d={`M ${x + dir * 11} 146 Q ${x + dir * 22} 160 ${x + dir * 24} 172`} color={COAT} w={9} />
      <Hand x={x + dir * 25} y={176} skin={SKIN_B} r={4.2} />
      <g transform={`rotate(${dir * -12} ${x + dir * 28} 172)`}>
        <rect x={x + dir * 28 - 11} y={158} width={22} height={30} rx={3} fill="#cfd8e3" />
        <rect x={x + dir * 28 - 6} y={154} width={12} height={7} rx={2.5} fill="#9aa8bb" />
        <line x1={x + dir * 28 - 6} y1={168} x2={x + dir * 28 + 6} y2={168} stroke="#7c8aa0" strokeWidth={2} />
        <line x1={x + dir * 28 - 6} y1={175} x2={x + dir * 28 + 4} y2={175} stroke="#7c8aa0" strokeWidth={2} />
      </g>
      <Limb d={`M ${x - dir * 11} 146 Q ${x - dir * 15} 166 ${x - dir * 13} 186`} color={COAT} w={9} />
      <Hand x={x - dir * 13} y={191} skin={SKIN_B} r={4.2} />
      <PHead x={x} y={117} skin={SKIN_B} hair={HAIR_B} mood="calm" dir={dir} />
      {/* glasses */}
      <circle cx={x + dir * 6} cy={115} r={4} fill="none" stroke={INKF} strokeWidth={1.4} />
      <line x1={x + dir * 2} y1={115} x2={x - dir * 4} y2={114} stroke={INKF} strokeWidth={1.4} />
    </g>
  );
}

/* ================= scenes: VAN háziorvos ================= */

function SceneExam() {
  return (
    <g className="ps-scene__art">
      <line x1={70} y1={262} x2={570} y2={262} stroke={FURN} strokeWidth={3} strokeLinecap="round" />
      {/* exam table */}
      <rect x={366} y={198} width={150} height={13} rx={5} fill="#3a4a60" />
      <rect x={366} y={192} width={150} height={8} rx={4} fill="#54678a" />
      <rect x={380} y={211} width={7} height={51} rx={3} fill={FURN} />
      <rect x={496} y={211} width={7} height={51} rx={3} fill={FURN} />
      {/* patient sitting on the table (breathing) */}
      <g className="ps-breathe">
        <path d={`M 415 146 q 14 -9 28 0 l 3 48 h -34 z`} fill={SWEATER} />
        <Limb d={`M 421 152 Q 415 172 418 190`} color={SWEATER} w={10} />
        <Hand x={418} y={194} skin={SKIN_A} />
        <PHead x={428} y={126} skin={SKIN_A} hair={HAIR_A} mood="calm" dir={-1} />
      </g>
      <Limb d={`M 424 196 L 420 240 L 421 252`} color={JEANS} w={12} />
      <Limb d={`M 438 196 L 438 242 L 439 252`} color={JEANS} w={12} />
      <Shoe x={419} y={257} dir={-1} />
      <Shoe x={439} y={257} dir={1} />
      {/* stool + seated doctor, pulled up next to the table so the
          stethoscope arm stays anatomically short */}
      <ellipse cx={330} cy={214} rx={19} ry={6} fill="#54678a" />
      <rect x={326} y={218} width={7} height={44} rx={3} fill={FURN} />
      <Limb d={`M 332 200 L 350 226 L 344 252`} color={SHOE} w={11} />
      <Shoe x={346} y={257} dir={1} />
      <path d={`M 316 142 q 14 -10 28 2 l 6 58 q -20 8 -38 2 z`} fill={COAT} />
      <path d={`M 326 143 l 5 9 l 6 -9 z`} fill={SCRUB} />
      {/* stethoscope: earpiece tube + animated forearm with chest piece */}
      <path d={`M 322 132 q -10 18 2 30`} stroke="var(--accent)" strokeWidth={2.6}
        fill="none" strokeLinecap="round" />
      <Limb d={`M 330 150 Q 346 154 360 161`} color={COAT} w={9.5} />
      <g className="ps-listen">
        <Limb d={`M 360 161 L 388 166`} color={COAT} w={9} />
        <Hand x={392} y={167} skin={SKIN_B} r={4.6} />
        <path d={`M 324 162 q 42 -12 76 8`} stroke="var(--accent)" strokeWidth={2.4}
          fill="none" strokeLinecap="round" />
        <circle cx={400} cy={170} r={7} fill="var(--accent)" />
        <circle cx={400} cy={170} r={3} fill="#0b1016" opacity={0.35} />
      </g>
      <PHead x={328} y={122} skin={SKIN_B} hair={HAIR_B} mood="calm" dir={1} />
      <circle cx={334} cy={120} r={4} fill="none" stroke={INKF} strokeWidth={1.4} />
      <line x1={330} y1={120} x2={324} y2={119} stroke={INKF} strokeWidth={1.4} />
      {/* heartbeat rings from the chest */}
      <circle className="ps-pulse" cx={404} cy={170} r={10} fill="none"
        stroke="var(--accent)" strokeWidth={2} />
      <circle className="ps-pulse ps-pulse--late" cx={404} cy={170} r={10} fill="none"
        stroke="var(--accent)" strokeWidth={2} />
    </g>
  );
}

function SceneScreening() {
  return (
    <g className="ps-scene__art">
      <line x1={70} y1={262} x2={570} y2={262} stroke={FURN} strokeWidth={3} strokeLinecap="round" />
      {/* ECG cart: running trace, cable with electrode on the patient */}
      <rect x={96} y={150} width={86} height={58} rx={6} fill="#0e1622"
        stroke={FURN} strokeWidth={3} />
      <path className="ps-ecg" d="M 104 180 h 14 l 6 -14 l 7 24 l 6 -14 l 5 4 h 16 l 5 -10 l 6 14 h 8"
        stroke="var(--accent)" strokeWidth={2} fill="none" />
      <rect x={132} y={208} width={8} height={46} rx={3.5} fill={FURN} />
      <path d="M 112 258 h 48" stroke={FURN} strokeWidth={4} strokeLinecap="round" />
      <DoctorStanding x={228} dir={1} />
      <PatientStanding x={352} mood="calm" />
      {/* cable runs along the floor, past the doctor, up to the electrode */}
      <path d="M 180 204 Q 196 252 244 254 L 292 254 Q 334 254 339 168"
        stroke="var(--accent)" strokeWidth={2.2} fill="none"
        strokeLinecap="round" opacity={0.85} />
      <circle cx={340} cy={163} r={4.5} fill="var(--accent)" />
      {/* the finding on the shoulder */}
      <circle className="ps-spot" cx={367} cy={146} r={5.5} fill="var(--alert-soft)" />
      <circle className="ps-spot-ring" cx={367} cy={146} r={11} fill="none"
        stroke="var(--alert-soft)" strokeWidth={2} />
      {/* sweeping magnifier that settles on the spot */}
      <g className="ps-mag">
        <circle cx={367} cy={146} r={25} strokeWidth={4} stroke="var(--accent)"
          fill="color-mix(in srgb, var(--accent) 8%, transparent)" />
        <line x1={386} y1={165} x2={410} y2={191} stroke="var(--accent)"
          strokeWidth={6} strokeLinecap="round" />
      </g>
    </g>
  );
}

function SceneTreatment() {
  return (
    <g className="ps-scene__art">
      <line x1={70} y1={262} x2={570} y2={262} stroke={FURN} strokeWidth={3} strokeLinecap="round" />
      {/* side table with pill bottle + water */}
      <rect x={222} y={204} width={78} height={7} rx={3.5} fill="#54678a" />
      <rect x={230} y={211} width={6} height={51} rx={3} fill={FURN} />
      <rect x={286} y={211} width={6} height={51} rx={3} fill={FURN} />
      <rect x={238} y={172} width={22} height={32} rx={4} fill="var(--accent)" opacity={0.9} />
      <rect x={241} y={165} width={16} height={9} rx={3} fill="#7c8aa0" />
      <path d="M 245 186 h 8 m -4 -4 v 8" stroke="#0b1016" strokeWidth={2.6} strokeLinecap="round" />
      <path d="M 268 180 l 3 24 h 12 l 3 -24 z" fill="#9fc4dd" opacity={0.75} />
      {/* patient taking the pill: fixed left arm, animated right arm */}
      <g>
        <Limb d={`M 345 196 L 343 257`} color={JEANS} w={12} />
        <Limb d={`M 359 196 L 361 257`} color={JEANS} w={12} />
        <Shoe x={343} y={262} dir={-1} />
        <Shoe x={361} y={262} dir={1} />
        <path d={`M 337 138 q 15 -10 30 0 l 4 52 q -19 8 -38 0 z`} fill={SWEATER} />
        <Limb d={`M 341 146 Q 335 168 337 188`} color={SWEATER} w={10} />
        <Hand x={337} y={193} skin={SKIN_A} />
        <g transform="translate(366 148)">
          <g className="ps-arm">
            <Limb d={`M 0 0 Q 10 14 22 22`} color={SWEATER} w={10} />
            <Hand x={24} y={24} skin={SKIN_A} />
            <circle cx={28} cy={22} r={4} fill="var(--accent)" />
          </g>
        </g>
        <PHead x={352} y={118} skin={SKIN_A} hair={HAIR_A} mood="calm" dir={1} />
      </g>
      {/* strengthening heart */}
      <path className="ps-heart"
        d="M 352 84 c -5 -8 -17 -6 -17 3 c 0 7 9 12 17 18 c 8 -6 17 -11 17 -18 c 0 -9 -12 -11 -17 -3 z"
        fill="var(--accent)" opacity={0.95} />
      {/* the same patient later that week: an easy daily walk, feeling well */}
      <g transform="translate(492 0)">
        <path className="ps-dash" d="M -46 214 h 16 M -56 234 h 13"
          stroke="var(--ink-faint)" strokeWidth={3} strokeLinecap="round" />
        <g className="ps-step">
          <Limb d={`M -6 196 L -11 252`} color={JEANS} w={12} />
          <Shoe x={-11} y={257} dir={-1} />
        </g>
        <g className="ps-step ps-step--b">
          <Limb d={`M 8 196 L 13 252`} color={JEANS} w={12} />
          <Shoe x={13} y={257} dir={1} />
        </g>
        <g className="ps-stroll">
          <path d={`M -15 138 q 15 -10 30 0 l 4 52 q -19 8 -38 0 z`} fill={SWEATER} />
          <g className="ps-step ps-step--b">
            <Limb d={`M -11 146 Q -16 168 -14 186`} color={SWEATER} w={10} />
            <Hand x={-14} y={191} skin={SKIN_A} />
          </g>
          <g className="ps-step">
            <Limb d={`M 11 146 Q 16 168 14 186`} color={SWEATER} w={10} />
            <Hand x={14} y={191} skin={SKIN_A} />
          </g>
          <PHead x={0} y={118} skin={SKIN_A} hair={HAIR_A} mood="happy" dir={1} />
        </g>
      </g>
    </g>
  );
}

function SceneHealthy() {
  return (
    <g className="ps-scene__art">
      {/* sun with rotating rays */}
      <g className="ps-sun">
        <circle cx={150} cy={116} r={17} fill="#ffd27a" />
        {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
          <line key={a} x1={150 + 25 * Math.cos((a * Math.PI) / 180)}
            y1={116 + 25 * Math.sin((a * Math.PI) / 180)}
            x2={150 + 33 * Math.cos((a * Math.PI) / 180)}
            y2={116 + 33 * Math.sin((a * Math.PI) / 180)}
            stroke="#ffd27a" strokeWidth={3} strokeLinecap="round" />
        ))}
      </g>
      {/* meadow + tree */}
      <path d="M 60 262 q 160 -26 280 -6 q 140 22 240 6" stroke={FURN}
        strokeWidth={3} fill="none" strokeLinecap="round" />
      <rect x={500} y={210} width={7} height={48} rx={3} fill="#6b4a32" />
      <circle cx={503} cy={196} r={22} fill="#3f9d6e" />
      <circle cx={488} cy={206} r={13} fill="#358a5e" />
      {/* the same patient, jumping happily */}
      <g className="ps-hop">
        <Limb d={`M 345 196 L 336 232 L 340 250`} color={JEANS} w={12} />
        <Limb d={`M 359 196 L 368 232 L 364 250`} color={JEANS} w={12} />
        <Shoe x={338} y={255} dir={-1} />
        <Shoe x={366} y={255} dir={1} />
        <path d={`M 337 138 q 15 -10 30 0 l 4 52 q -19 8 -38 0 z`} fill={SWEATER} />
        <Limb d={`M 340 144 Q 326 128 318 112`} color={SWEATER} w={10} />
        <Hand x={316} y={108} skin={SKIN_A} />
        <Limb d={`M 364 144 Q 378 128 386 112`} color={SWEATER} w={10} />
        <Hand x={388} y={108} skin={SKIN_A} />
        <PHead x={352} y={118} skin={SKIN_A} hair={HAIR_A} mood="happy" dir={1} />
      </g>
      <path className="ps-heart"
        d="M 352 78 c -5 -8 -17 -6 -17 3 c 0 7 9 12 17 18 c 8 -6 17 -11 17 -18 c 0 -9 -12 -11 -17 -3 z"
        fill="var(--alert)" />
      <path className="ps-bird" d="M 430 108 q 7 -7 14 0 q 7 -7 14 0" stroke="var(--ink-dim)"
        strokeWidth={2} fill="none" strokeLinecap="round" />
      <path className="ps-bird ps-bird--late" d="M 478 92 q 6 -6 12 0 q 6 -6 12 0"
        stroke="var(--ink-dim)" strokeWidth={2} fill="none" strokeLinecap="round" />
    </g>
  );
}

/* ================= scenes: NINCS háziorvos ================= */

function SceneVacant() {
  return (
    <g className="ps-scene__art">
      <line x1={70} y1={262} x2={570} y2={262} stroke={FURN} strokeWidth={3} strokeLinecap="round" />
      {/* flickering ceiling lamp */}
      <line x1={320} y1={58} x2={320} y2={82} stroke={FURN} strokeWidth={3} />
      <path className="ps-flicker" d="M 320 84 L 272 196 h 96 z"
        fill="color-mix(in srgb, var(--alert-soft) 8%, transparent)" />
      <path d="M 306 82 h 28 l -5 12 h -18 z" fill="#54678a" />
      {/* the same exam room, now grey and empty */}
      <g opacity={0.6}>
        <rect x={366} y={198} width={150} height={13} rx={5} fill="#33415a" />
        <rect x={366} y={192} width={150} height={8} rx={4} fill="#415270" />
        <rect x={380} y={211} width={7} height={51} rx={3} fill={FURN} />
        <rect x={496} y={211} width={7} height={51} rx={3} fill={FURN} />
        <ellipse cx={280} cy={216} rx={19} ry={6} fill="#415270" />
        <rect x={276} y={220} width={7} height={42} rx={3} fill={FURN} />
      </g>
      {/* door with a swinging vacancy sign */}
      <rect x={106} y={118} width={66} height={144} rx={4} fill="none"
        stroke={FURN} strokeWidth={3} />
      <circle cx={162} cy={196} r={3.4} fill={FURN} />
      <g className="ps-swing">
        <line x1={139} y1={130} x2={139} y2={146} stroke={FURN} strokeWidth={2} />
        <rect x={117} y={146} width={44} height={22} rx={4} fill="#1a2431"
          stroke="var(--alert)" strokeWidth={2.4} />
        <line x1={124} y1={154} x2={154} y2={154} stroke="var(--alert)" strokeWidth={2.4} />
        <line x1={128} y1={160} x2={150} y2={160} stroke="var(--alert)" strokeWidth={2.4} />
      </g>
      <text className="ps-q" x={356} y={152} fill="var(--alert-soft)">?</text>
      <text className="ps-q ps-q--d1" x={420} y={170} fill="var(--alert-soft)">?</text>
      <text className="ps-q ps-q--d2" x={308} y={186} fill="var(--alert-soft)">?</text>
      {/* signs of long absence: cobweb on the door frame */}
      <g opacity={0.45} stroke="#c3ceda" strokeWidth={1.3} fill="none">
        <path d="M 106 118 h 26 M 106 118 v 26 M 106 118 l 19 19" />
        <path d="M 118 118 q -1 6 -12 12 M 128 118 q -3 12 -22 22" />
      </g>
      {/* wilted waiting-room plant */}
      <path d="M 208 262 h 30 l -4 -22 h -22 z" fill="#33415a" />
      <g className="ps-wilt">
        <path d="M 222 240 q 2 -18 -6 -26" stroke="#4a7c59" strokeWidth={3}
          fill="none" strokeLinecap="round" />
        <path d="M 216 214 q -7 2 -9 9 q 8 1 9 -9 z" fill="#4a7c59" opacity={0.8} />
        <path d="M 228 230 q 8 4 8 12" stroke="#4a7c59" strokeWidth={2.5}
          fill="none" strokeLinecap="round" />
      </g>
      {/* unopened mail piling up under the letter slot */}
      <g transform="rotate(-5 196 250)">
        <rect x={178} y={244} width={34} height={10} rx={2} fill="#c3ceda" opacity={0.85} />
        <path d="M 178 244 l 17 6 l 17 -6" stroke="#7c8aa0" strokeWidth={1.4} fill="none" />
      </g>
      <rect x={184} y={254} width={34} height={8} rx={2} fill="#9aa8bb" opacity={0.65} />
      {/* dust motes drifting in the lamplight */}
      <circle className="ps-dust" cx={302} cy={150} r={2} fill="#c3ceda" />
      <circle className="ps-dust ps-dust--d1" cx={330} cy={172} r={1.6} fill="#c3ceda" />
      <circle className="ps-dust ps-dust--d2" cx={314} cy={190} r={1.8} fill="#c3ceda" />
    </g>
  );
}

function SceneWandering() {
  return (
    <g className="ps-scene__art">
      <line x1={70} y1={262} x2={570} y2={262} stroke={FURN} strokeWidth={3} strokeLinecap="round" />
      {/* closed surgery in the background */}
      <g opacity={0.55}>
        <rect x={506} y={128} width={58} height={134} rx={4} fill="none"
          stroke={FURN} strokeWidth={3} />
        <rect x={516} y={146} width={38} height={16} rx={3} fill="#1a2431"
          stroke="var(--alert)" strokeWidth={2} />
      </g>
      {/* the same patient, slumped and pacing */}
      <g className="ps-wander">
        <Limb d={`M 258 200 L 256 257`} color={JEANS} w={12} />
        <Limb d={`M 272 200 L 274 257`} color={JEANS} w={12} />
        <Shoe x={256} y={262} dir={-1} />
        <Shoe x={274} y={262} dir={1} />
        <path d={`M 252 146 q 14 -14 28 -4 l 6 54 q -19 8 -38 0 z`} fill={SWEATER} />
        <Limb d={`M 256 152 Q 250 174 253 194`} color={SWEATER} w={10} />
        <Hand x={253} y={199} skin={SKIN_A} />
        <Limb d={`M 276 150 Q 282 172 279 192`} color={SWEATER} w={10} />
        <Hand x={279} y={197} skin={SKIN_A} />
        <PHead x={270} y={130} skin={SKIN_A} hair={HAIR_A} mood="sad" dir={1} />
        <text className="ps-q ps-q--d1" x={258} y={100} fill="var(--alert-soft)">?</text>
      </g>
      {/* an elderly man shuffling with a cane — his screening is missed too */}
      <g className="ps-shuffle">
        <g className="ps-cane">
          <line x1={110} y1={200} x2={103} y2={258} stroke="#8a6d4a" strokeWidth={4}
            strokeLinecap="round" />
          <path d="M 110 200 q 1 -8 9 -7" stroke="#8a6d4a" strokeWidth={4}
            fill="none" strokeLinecap="round" />
        </g>
        <Limb d={`M 138 206 L 136 257`} color="#5c6470" w={11} />
        <Limb d={`M 150 206 L 154 257`} color="#5c6470" w={11} />
        <Shoe x={136} y={262} dir={-1} />
        <Shoe x={154} y={262} dir={1} />
        <path d={`M 130 162 q 10 -18 26 -10 l 8 56 q -18 7 -36 0 z`} fill="#6d8a5a" />
        <Limb d={`M 132 168 Q 120 184 112 196`} color="#6d8a5a" w={9} />
        <Hand x={110} y={199} skin={SKIN_C} r={4.2} />
        <Limb d={`M 152 168 Q 158 186 155 200`} color="#6d8a5a" w={9} />
        <Hand x={155} y={204} skin={SKIN_C} r={4.2} />
        <PHead x={146} y={144} skin={SKIN_C} hair="#c3ceda" mood="sad" dir={-1} r={12} />
      </g>
      {/* a second patient drifting behind */}
      <g className="ps-wander ps-wander--late" opacity={0.85}>
        <Limb d={`M 408 202 L 406 257`} color="#5a4a5e" w={11} />
        <Limb d={`M 420 202 L 422 257`} color="#5a4a5e" w={11} />
        <Shoe x={406} y={262} dir={-1} />
        <Shoe x={422} y={262} dir={1} />
        <path d={`M 402 152 q 12 -12 24 -4 l 5 50 q -17 7 -34 0 z`} fill="#a35d76" />
        <Limb d={`M 405 158 Q 400 178 402 196`} color="#a35d76" w={9} />
        <Hand x={402} y={200} skin={SKIN_C} r={4.2} />
        <PHead x={416} y={137} skin={SKIN_C} hair={HAIR_C} mood="sad" dir={-1} bun />
      </g>
    </g>
  );
}

function SceneLate() {
  return (
    <g className="ps-scene__art">
      <line x1={70} y1={262} x2={570} y2={262} stroke={FURN} strokeWidth={3} strokeLinecap="round" />
      {/* the same patient: limping, one hand pressed on the small of his back */}
      <g className="ps-limp">
        <Limb d={`M 340 198 L 337 257`} color={JEANS} w={12} />
        <Limb d={`M 354 198 L 360 255`} color={JEANS} w={12} />
        <Shoe x={337} y={262} dir={-1} />
        <Shoe x={360} y={260} dir={1} />
        <path d={`M 334 146 q 12 -16 28 -8 l 8 56 q -20 8 -40 0 z`} fill={SWEATER} />
        <Limb d={`M 338 152 Q 328 166 332 178`} color={SWEATER} w={10} />
        <Hand x={334} y={181} skin={SKIN_A} />
        <PHead x={354} y={126} skin={SKIN_A} hair={HAIR_A} mood="worried" dir={1} />
        {/* the growing, unnoticed finding on the back */}
        <ellipse className="ps-grow" cx={336} cy={152} rx={13} ry={10} fill="var(--alert)" opacity={0.9} />
        <circle className="ps-grow-ring" cx={336} cy={152} r={19} fill="none"
          stroke="var(--alert)" strokeWidth={2} />
        {/* pain flashes radiating from it */}
        <g className="ps-pain">
          <path d="M 324 138 l -7 -8 M 334 132 l -2 -11 M 316 150 l -11 -4"
            stroke="var(--alert)" strokeWidth={2.6} strokeLinecap="round" />
        </g>
      </g>
      <g className="ps-alarm">
        <line x1={392} y1={104} x2={392} y2={124} stroke="var(--alert)" strokeWidth={4.4}
          strokeLinecap="round" />
        <circle cx={392} cy={134} r={2.8} fill="var(--alert)" />
      </g>
      {/* calendar pages: time passes */}
      <g>
        <rect x={186} y={118} width={52} height={46} rx={5} fill="#1a2431"
          stroke={FURN} strokeWidth={2.6} />
        <rect x={186} y={118} width={52} height={13} rx={5} fill="#54678a" />
        <line x1={199} y1={112} x2={199} y2={122} stroke={FURN} strokeWidth={2.6} strokeLinecap="round" />
        <line x1={225} y1={112} x2={225} y2={122} stroke={FURN} strokeWidth={2.6} strokeLinecap="round" />
        <path className="ps-cal-x1" d="M 194 138 l 8 8 m 0 -8 l -8 8" stroke="var(--alert-soft)"
          strokeWidth={2.4} strokeLinecap="round" />
        <path className="ps-cal-x2" d="M 208 138 l 8 8 m 0 -8 l -8 8" stroke="var(--alert-soft)"
          strokeWidth={2.4} strokeLinecap="round" />
        <path className="ps-cal-x3" d="M 222 138 l 8 8 m 0 -8 l -8 8" stroke="var(--alert-soft)"
          strokeWidth={2.4} strokeLinecap="round" />
      </g>
    </g>
  );
}

function SceneHospital() {
  return (
    <g className="ps-scene__art">
      <line x1={70} y1={262} x2={570} y2={262} stroke={FURN} strokeWidth={3} strokeLinecap="round" />
      {/* night window */}
      <rect x={122} y={84} width={80} height={66} rx={5} fill="#0e1622"
        stroke={FURN} strokeWidth={3} />
      <g opacity={0.85}>
        <circle cx={176} cy={112} r={11} fill="#c3ceda" />
        <circle cx={182} cy={108} r={10} fill="#0e1622" />
      </g>
      <circle cx={142} cy={124} r={1.7} fill="#c3ceda" />
      <circle cx={154} cy={102} r={1.7} fill="#c3ceda" />
      {/* hospital bed with the same patient lying in it */}
      <rect x={252} y={202} width={216} height={15} rx={6} fill="#54678a" />
      <rect x={258} y={217} width={8} height={45} rx={3.5} fill={FURN} />
      <rect x={450} y={217} width={8} height={45} rx={3.5} fill={FURN} />
      <rect x={250} y={172} width={7} height={45} rx={3.5} fill={FURN} />
      <rect x={262} y={188} width={40} height={14} rx={7} fill="#c3ceda" />
      <PHead x={288} y={182} skin={SKIN_A} hair={HAIR_A} mood="asleep" dir={1} r={13} />
      <path d="M 302 202 q 10 -14 34 -12 q 96 -8 126 6 l 2 6 z" fill="#3a4a60" />
      <path d="M 302 202 q 10 -14 34 -12" stroke="#54678a" strokeWidth={2.5} fill="none" />
      {/* IV stand with a falling drop */}
      <rect x={504} y={104} width={5} height={158} rx={2.5} fill={FURN} />
      <path d="M 492 250 h 29" stroke={FURN} strokeWidth={4} strokeLinecap="round" />
      <rect x={496} y={104} width={21} height={32} rx={5} fill="none"
        stroke="var(--accent)" strokeWidth={2.6} />
      <path d="M 506 136 q 0 32 -24 54" stroke="var(--accent)" strokeWidth={2}
        fill="none" />
      <circle className="ps-drip" cx={506} cy={140} r={3.2} fill="var(--accent)" />
      {/* bedside monitor */}
      <rect x={176} y={168} width={64} height={46} rx={5} fill="#0e1622"
        stroke={FURN} strokeWidth={3} />
      <rect x={204} y={214} width={7} height={48} rx={3} fill={FURN} />
      <path className="ps-ecg-slow" d="M 182 192 h 13 l 5 -10 l 6 18 l 5 -8 h 22"
        stroke="var(--alert)" strokeWidth={2} fill="none" />
      {/* the bill: care that arrives this late costs multiples */}
      <g transform="rotate(6 542 226)">
        <rect x={520} y={196} width={44} height={58} rx={4} fill="#e9eef5" />
        <line x1={528} y1={208} x2={556} y2={208} stroke="#7c8aa0" strokeWidth={2.4} />
        <line x1={528} y1={218} x2={552} y2={218} stroke="#9aa8bb" strokeWidth={2} />
        <line x1={528} y1={226} x2={554} y2={226} stroke="#9aa8bb" strokeWidth={2} />
        <line x1={528} y1={234} x2={548} y2={234} stroke="#9aa8bb" strokeWidth={2} />
        <text x={542} y={250} textAnchor="middle" fill="var(--alert)"
          style={{ font: '800 13px var(--font-body)' }}>Ft</text>
      </g>
      <text className="ps-q ps-ft" x={520} y={184} fill="var(--alert-soft)">Ft</text>
      <text className="ps-q ps-q--d1 ps-ft" x={552} y={172} fill="var(--alert-soft)">Ft</text>
      <text className="ps-q ps-q--d2 ps-ft" x={534} y={192} fill="var(--alert-soft)">Ft</text>
    </g>
  );
}

/* ================= dental scenes =================
   Illustrations live in ../assets/story/*.svg (curated, metadata-stripped);
   the scenes position them and add the animated overlays. */

function DSceneDentist() {
  return (
    <g className="ps-scene__art">
      <line x1={70} y1={262} x2={570} y2={262} stroke={FURN} strokeWidth={3} strokeLinecap="round" />
      <g className="ps-sway">
        <g className="ps-breathe-img">
          <image href={imgDentist} x={228} y={50} width={199} height={212} />
        </g>
      </g>
      {/* the practice is open: warm glow + sparkles */}
      <path className="ps-glow" d="M 250 262 h 156 l -18 -10 h -120 z"
        fill="color-mix(in srgb, var(--accent) 10%, transparent)" />
      <path className="ps-spark" d="M 452 96 l 0 10 M 447 101 l 10 0"
        stroke="var(--accent)" strokeWidth={2} strokeLinecap="round" />
      <path className="ps-spark ps-spark--d1" d="M 208 120 l 0 8 M 204 124 l 8 0"
        stroke="var(--accent)" strokeWidth={2} strokeLinecap="round" />
    </g>
  );
}

function DSceneXray() {
  return (
    <g className="ps-scene__art">
      <line x1={70} y1={262} x2={570} y2={262} stroke={FURN} strokeWidth={3} strokeLinecap="round" />
      {/* lightbox with the X-ray of a tooth */}
      <rect x={180} y={80} width={280} height={182} rx={10} fill="#0e1622"
        stroke={FURN} strokeWidth={3} />
      <rect x={194} y={92} width={252} height={158} rx={6}
        fill="color-mix(in srgb, #9fc4dd 13%, transparent)" />
      <image href={imgToothShape} x={272} y={100} width={94} height={155} opacity={0.95} />
      {/* the small, still symptomless lesion */}
      <circle className="ps-spot" cx={330} cy={126} r={6} fill="var(--alert-soft)" />
      <circle className="ps-spot-ring" cx={330} cy={126} r={12} fill="none"
        stroke="var(--alert-soft)" strokeWidth={2} />
      {/* magnifier settles on the lesion */}
      <g className="ps-mag">
        <circle cx={330} cy={126} r={26} strokeWidth={4} stroke="var(--accent)"
          fill="color-mix(in srgb, var(--accent) 8%, transparent)" />
        <line x1={350} y1={146} x2={376} y2={174} stroke="var(--accent)"
          strokeWidth={6} strokeLinecap="round" />
      </g>
    </g>
  );
}

function DSceneFilling() {
  return (
    <g className="ps-scene__art">
      <line x1={70} y1={262} x2={570} y2={262} stroke={FURN} strokeWidth={3} strokeLinecap="round" />
      {/* treatment under way */}
      <g className="ps-breathe-img">
        <image href={imgTreatment} x={96} y={50} width={199} height={212} />
      </g>
      {/* close-up: the cavity disappears, a small filling appears */}
      <image href={imgToothShape} x={420} y={84} width={84} height={139} />
      <circle className="ps-cavity" cx={470} cy={110} r={8} fill="var(--alert)" />
      <g className="ps-fillin">
        <path d="M 460 104 q 10 -6 20 0 q 2 8 -10 10 q -12 -2 -10 -10 z" fill="var(--accent)" />
      </g>
      <path className="ps-spark" d="M 516 92 l 0 10 M 511 97 l 10 0"
        stroke="var(--accent)" strokeWidth={2.2} strokeLinecap="round" />
      <path className="ps-spark ps-spark--d1" d="M 408 130 l 0 9 M 403.5 134.5 l 9 0"
        stroke="var(--accent)" strokeWidth={2.2} strokeLinecap="round" />
    </g>
  );
}

function DSceneSmile() {
  return (
    <g className="ps-scene__art">
      {/* sun + meadow */}
      <g className="ps-sun">
        <circle cx={130} cy={112} r={17} fill="#ffd27a" />
        {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
          <line key={a} x1={130 + 25 * Math.cos((a * Math.PI) / 180)}
            y1={112 + 25 * Math.sin((a * Math.PI) / 180)}
            x2={130 + 33 * Math.cos((a * Math.PI) / 180)}
            y2={112 + 33 * Math.sin((a * Math.PI) / 180)}
            stroke="#ffd27a" strokeWidth={3} strokeLinecap="round" />
        ))}
      </g>
      <path d="M 60 262 q 160 -26 280 -6 q 140 22 240 6" stroke={FURN}
        strokeWidth={3} fill="none" strokeLinecap="round" />
      {/* the healthy, happy tooth */}
      <g className="ps-hop">
        <image href={imgSmilingTooth} x={228} y={58} width={187} height={200} />
      </g>
      <path className="ps-spark" d="M 436 96 l 0 12 M 430 102 l 12 0"
        stroke="var(--accent)" strokeWidth={2.4} strokeLinecap="round" />
      <path className="ps-spark ps-spark--d1" d="M 212 84 l 0 9 M 207.5 88.5 l 9 0"
        stroke="var(--accent)" strokeWidth={2.2} strokeLinecap="round" />
      <path className="ps-bird" d="M 470 108 q 7 -7 14 0 q 7 -7 14 0" stroke="var(--ink-dim)"
        strokeWidth={2} fill="none" strokeLinecap="round" />
    </g>
  );
}

/* ================= scenes: NINCS fogorvos ================= */

function DSceneVacant() {
  return (
    <g className="ps-scene__art">
      <line x1={70} y1={262} x2={570} y2={262} stroke={FURN} strokeWidth={3} strokeLinecap="round" />
      {/* flickering lamp */}
      <line x1={330} y1={58} x2={330} y2={82} stroke={FURN} strokeWidth={3} />
      <path className="ps-flicker" d="M 330 84 L 282 196 h 96 z"
        fill="color-mix(in srgb, var(--alert-soft) 8%, transparent)" />
      <path d="M 316 82 h 28 l -5 12 h -18 z" fill="#54678a" />
      {/* door with vacancy sign */}
      <rect x={106} y={118} width={66} height={144} rx={4} fill="none"
        stroke={FURN} strokeWidth={3} />
      <circle cx={162} cy={196} r={3.4} fill={FURN} />
      <g className="ps-swing">
        <line x1={139} y1={130} x2={139} y2={146} stroke={FURN} strokeWidth={2} />
        <rect x={117} y={146} width={44} height={22} rx={4} fill="#1a2431"
          stroke="var(--alert)" strokeWidth={2.4} />
        <line x1={124} y1={154} x2={154} y2={154} stroke="var(--alert)" strokeWidth={2.4} />
        <line x1={128} y1={160} x2={150} y2={160} stroke="var(--alert)" strokeWidth={2.4} />
      </g>
      {/* the chair stands dark and unused */}
      <image href={imgChair} x={344} y={74} width={176} height={188} opacity={0.8}
        style={{ filter: 'grayscale(0.85) brightness(0.55)' }} />
      <text className="ps-q" x={300} y={140} fill="var(--alert-soft)">?</text>
      <text className="ps-q ps-q--d1" x={540} y={150} fill="var(--alert-soft)">?</text>
      <text className="ps-q ps-q--d2" x={236} y={128} fill="var(--alert-soft)">?</text>
      {/* cobweb + dust + unread mail, long-abandoned */}
      <g opacity={0.45} stroke="#c3ceda" strokeWidth={1.3} fill="none">
        <path d="M 106 118 h 26 M 106 118 v 26 M 106 118 l 19 19" />
        <path d="M 118 118 q -1 6 -12 12 M 128 118 q -3 12 -22 22" />
      </g>
      <g transform="rotate(-5 196 250)">
        <rect x={178} y={244} width={34} height={10} rx={2} fill="#c3ceda" opacity={0.85} />
        <path d="M 178 244 l 17 6 l 17 -6" stroke="#7c8aa0" strokeWidth={1.4} fill="none" />
      </g>
      <rect x={184} y={254} width={34} height={8} rx={2} fill="#9aa8bb" opacity={0.65} />
      <circle className="ps-dust" cx={306} cy={150} r={2} fill="#c3ceda" />
      <circle className="ps-dust ps-dust--d1" cx={344} cy={176} r={1.6} fill="#c3ceda" />
      <circle className="ps-dust ps-dust--d2" cx={318} cy={192} r={1.8} fill="#c3ceda" />
    </g>
  );
}

function DSceneCaries() {
  return (
    <g className="ps-scene__art">
      <line x1={70} y1={262} x2={570} y2={262} stroke={FURN} strokeWidth={3} strokeLinecap="round" />
      {/* calendar pages: screenings that never happen */}
      <g>
        <rect x={150} y={118} width={52} height={46} rx={5} fill="#1a2431"
          stroke={FURN} strokeWidth={2.6} />
        <rect x={150} y={118} width={52} height={13} rx={5} fill="#54678a" />
        <line x1={163} y1={112} x2={163} y2={122} stroke={FURN} strokeWidth={2.6} strokeLinecap="round" />
        <line x1={189} y1={112} x2={189} y2={122} stroke={FURN} strokeWidth={2.6} strokeLinecap="round" />
        <path className="ps-cal-x1" d="M 158 138 l 8 8 m 0 -8 l -8 8" stroke="var(--alert-soft)"
          strokeWidth={2.4} strokeLinecap="round" />
        <path className="ps-cal-x2" d="M 172 138 l 8 8 m 0 -8 l -8 8" stroke="var(--alert-soft)"
          strokeWidth={2.4} strokeLinecap="round" />
        <path className="ps-cal-x3" d="M 186 138 l 8 8 m 0 -8 l -8 8" stroke="var(--alert-soft)"
          strokeWidth={2.4} strokeLinecap="round" />
      </g>
      {/* the unnoticed cavity keeps growing */}
      <image href={imgToothShape} x={350} y={92} width={102} height={169} opacity={0.92} />
      <ellipse className="ps-grow" cx={412} cy={124} rx={13} ry={11} fill="var(--alert)" opacity={0.9} />
      <circle className="ps-grow-ring" cx={412} cy={124} r={19} fill="none"
        stroke="var(--alert)" strokeWidth={2} />
      <text className="ps-q ps-q--d1" x={488} y={140} fill="var(--alert-soft)">?</text>
    </g>
  );
}

function DSceneToothache() {
  return (
    <g className="ps-scene__art">
      <line x1={70} y1={262} x2={570} y2={262} stroke={FURN} strokeWidth={3} strokeLinecap="round" />
      {/* the same night, at home, rocking in pain */}
      <g className="ps-shiver">
        <image href={imgPain} x={236} y={54} width={196} height={208} />
      </g>
      <g className="ps-pain">
        <path d="M 424 92 l 8 -8 M 430 110 l 11 -3 M 414 80 l 3 -11"
          stroke="var(--alert)" strokeWidth={2.8} strokeLinecap="round" />
      </g>
      <g className="ps-pain" style={{ animationDelay: '1.2s' }}>
        <path d="M 244 96 l -8 -8 M 238 114 l -11 -3 M 254 82 l -3 -11"
          stroke="var(--alert)" strokeWidth={2.8} strokeLinecap="round" />
      </g>
      {/* night: the pain does not keep office hours */}
      <g opacity={0.85}>
        <circle cx={516} cy={96} r={13} fill="#c3ceda" />
        <circle cx={523} cy={91} r={12} fill="var(--bg-raised)" />
      </g>
      <circle cx={488} cy={118} r={1.7} fill="#c3ceda" />
      <circle cx={540} cy={124} r={1.7} fill="#c3ceda" />
      {/* painkillers on the nightstand — all that is left */}
      <rect x={128} y={204} width={78} height={7} rx={3.5} fill="#54678a" />
      <rect x={136} y={211} width={6} height={51} rx={3} fill={FURN} />
      <rect x={192} y={211} width={6} height={51} rx={3} fill={FURN} />
      <rect x={144} y={182} width={34} height={20} rx={4} fill="#9aa8bb" opacity={0.9} />
      {[0, 1, 2].map((i) => (
        <circle key={i} cx={152 + i * 9} cy={192} r={2.6} fill="#0e1622" opacity={0.55} />
      ))}
    </g>
  );
}

function DSceneExtraction() {
  return (
    <g className="ps-scene__art">
      <line x1={70} y1={262} x2={570} y2={262} stroke={FURN} strokeWidth={3} strokeLinecap="round" />
      {/* the row of teeth with the fresh gap */}
      {[0, 1, 3, 4].map((i) => (
        <image key={i} href={imgToothShape} x={198 + i * 40} y={172} width={34}
          height={56} opacity={0.9} />
      ))}
      <path d="M 284 178 q 14 -5 28 0 q 3 24 -14 28 q -17 -4 -14 -28 z" fill="none"
        stroke="var(--alert)" strokeWidth={2} strokeDasharray="5 5" opacity={0.8} />
      {/* forceps holding the tooth that could not be saved */}
      <g className="ps-swing">
        <line x1={312} y1={54} x2={298} y2={98} stroke="#9aa8bb" strokeWidth={5} strokeLinecap="round" />
        <line x1={282} y1={56} x2={298} y2={98} stroke="#c3ceda" strokeWidth={5} strokeLinecap="round" />
        <line x1={298} y1={98} x2={292} y2={112} stroke="#9aa8bb" strokeWidth={4.6} strokeLinecap="round" />
        <line x1={298} y1={98} x2={304} y2={112} stroke="#c3ceda" strokeWidth={4.6} strokeLinecap="round" />
        <image href={imgToothShape} x={282} y={112} width={32} height={53}
          style={{ filter: 'grayscale(0.6) brightness(0.8)' }} />
        <circle cx={306} cy={122} r={5.5} fill="var(--alert)" />
      </g>
      {/* the bill: extraction, replacement, repeat visits */}
      <g transform="rotate(6 486 222)">
        <rect x={464} y={192} width={44} height={58} rx={4} fill="#e9eef5" />
        <line x1={472} y1={204} x2={500} y2={204} stroke="#7c8aa0" strokeWidth={2.4} />
        <line x1={472} y1={214} x2={496} y2={214} stroke="#9aa8bb" strokeWidth={2} />
        <line x1={472} y1={222} x2={498} y2={222} stroke="#9aa8bb" strokeWidth={2} />
        <line x1={472} y1={230} x2={492} y2={230} stroke="#9aa8bb" strokeWidth={2} />
        <text x={486} y={246} textAnchor="middle" fill="var(--alert)"
          style={{ font: '800 13px var(--font-body)' }}>Ft</text>
      </g>
      <text className="ps-q ps-ft" x={452} y={172} fill="var(--alert-soft)">Ft</text>
      <text className="ps-q ps-q--d1 ps-ft" x={496} y={162} fill="var(--alert-soft)">Ft</text>
      <text className="ps-q ps-q--d2 ps-ft" x={472} y={182} fill="var(--alert-soft)">Ft</text>
    </g>
  );
}

/* ================= the story player ================= */

const SCENES: Record<Variant, (() => ReactElement)[]> = {
  ok: [SceneExam, SceneScreening, SceneTreatment, SceneHealthy],
  broken: [SceneVacant, SceneWandering, SceneLate, SceneHospital],
};

const SCENES_DENTAL: Record<Variant, (() => ReactElement)[]> = {
  ok: [DSceneDentist, DSceneXray, DSceneFilling, DSceneSmile],
  broken: [DSceneVacant, DSceneCaries, DSceneToothache, DSceneExtraction],
};

export function PreventionStory() {
  const kind = useAppStore((s) => s.kind);
  const [variant, setVariant] = useState<Variant>('ok');
  const [scene, setScene] = useState(0);
  // bumped on every manual selection so the auto-advance timer restarts
  // instead of overriding the user's choice a moment later
  const [timerGen, setTimerGen] = useState(0);
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
  }, [variant, timerGen]);

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
  useEffect(() => {
    setVariant('ok');
    setScene(0);
    setTimerGen((g) => g + 1);
  }, [kind]);

  const scenes = kind === 'dental' ? SCENES_DENTAL : SCENES;
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

      <div className="story__stage">
        <svg viewBox="0 0 640 330" role="img" aria-label={titles[scene]}>
          {scenes[variant].map((Scene, i) => (
            <g key={`${kind}-${variant}-${i}`} transform="translate(0 48)"
              className={`ps-scene ${i === scene ? 'is-active' : ''}`}>
              <Scene />
            </g>
          ))}
        </svg>
        <div className="story__caption" key={`${variant}-${scene}`}>
          <h4>{titles[scene]}</h4>
          <p>{descs[scene]}</p>
        </div>
        <div className="story__steps">
          {titles.map((title, i) => (
            <button key={title} className={i === scene ? 'is-active' : ''}
              onClick={() => selectScene(i)} aria-label={title}>
              <span>{i + 1}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
