// Hero stat showcase: the landing stats appear one after another on an
// auto-advancing spotlight. Left: clickable rail of every stat. Right: the
// active stat with a count-up value and a per-stat animated visual
// (history sparkline, filling donut, dot matrix, city pictograms, timeline).
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { extent, scaleLinear, scaleTime } from 'd3';
import { t, tKind } from '../lib/i18n';
import {
  formatDuration, formatMonth, formatNumber, formatPercent, monthsBetween,
} from '../lib/format';
import {
  longestVacant, medianVacancyMonths, primarySite, SZOMBATHELY_POPULATION,
} from '../lib/selectors';
import {
  medianSeries, monthToDate, vacantSeries, type SeriesPoint,
} from '../lib/statsSelectors';
import { useAppStore, useHistoryEntries, useSnapshot } from '../store/useAppStore';

const STEP_MS = 5200;
const W = 460;
const H = 210;

/* ---------- count-up driver (eased 0 -> 1) ---------- */
function useProgress(): number {
  const [p, setP] = useState(() =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 0);
  useEffect(() => {
    if (p === 1) return; // reduced motion: already settled
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const lin = Math.min(1, (now - t0) / 950);
      setP(1 - (1 - lin) ** 3);
      if (lin < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const settle = window.setTimeout(() => setP(1), 1100);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(settle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return p;
}

function ActivePanel({ item }: { item: ShowcaseItem }) {
  const progress = useProgress();
  return (
    <div className="showcase__panel">
      <div className="showcase__value" style={{ color: item.color }}>
        {item.animText(progress)}
      </div>
      <div className="showcase__label">{item.label}</div>
      {item.visual(progress)}
      {item.note && <div className="showcase__note">{item.note}</div>}
    </div>
  );
}

/* ---------- visuals ---------- */

function Spark({ points, color, yFormat }: {
  points: SeriesPoint[]; color: string; yFormat: (v: number) => string;
}) {
  if (points.length < 2) return null;
  const dates = points.map((pt) => monthToDate(pt.month));
  const [d0, d1] = extent(dates) as [Date, Date];
  const x = scaleTime().domain([d0, d1]).range([16, W - 74]);
  const maxV = Math.max(...points.map((pt) => pt.value));
  const minV = Math.min(...points.map((pt) => pt.value));
  const pad = Math.max(1, (maxV - minV) * 0.18);
  const y = scaleLinear().domain([Math.max(0, minV - pad), maxV + pad]).range([H - 30, 16]);
  const line = points
    .map((pt, i) => `${i ? 'L' : 'M'}${x(monthToDate(pt.month))},${y(pt.value)}`)
    .join('');
  const last = points[points.length - 1];
  const lx = x(monthToDate(last.month));
  const ly = y(last.value);
  const area = `${line} L ${lx} ${H - 30} L ${x(d0)} ${H - 30} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="sc-visual" aria-hidden="true">
      <path d={area} fill={color} opacity={0.1} className="sc-fade" />
      <path d={line} fill="none" stroke={color} strokeWidth={2.5}
        strokeLinejoin="round" strokeLinecap="round" className="sc-draw"
        pathLength={1} />
      <circle cx={lx} cy={ly} r={4.5} fill={color}
        stroke="var(--bg-raised)" strokeWidth={2} className="sc-fade sc-fade--late" />
      <text x={Math.min(lx, W - 56)} y={ly - 12} fill="var(--ink)" fontSize={13}
        fontWeight={600} textAnchor="middle" className="sc-fade sc-fade--late">
        {yFormat(last.value)}
      </text>
      <text x={16} y={H - 10} fill="var(--ink-faint)" fontSize={11}>
        {d0.getFullYear()}
      </text>
      <text x={lx} y={H - 10} fill="var(--ink-faint)" fontSize={11} textAnchor="middle">
        {d1.getFullYear()}
      </text>
    </svg>
  );
}

function DotMatrix({ n, color }: { n: number; color: string }) {
  const cols = 10;
  const gap = 26;
  const x0 = (W - (cols - 1) * gap) / 2;
  const rows = Math.ceil(n / cols);
  const y0 = (H - 24 - (rows - 1) * gap) / 2 + 8;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="sc-visual" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <circle key={i}
          cx={x0 + (i % cols) * gap} cy={y0 + Math.floor(i / cols) * gap}
          r={7.5} fill={color} className="sc-pop"
          style={{ animationDelay: `${i * 45}ms` }} />
      ))}
    </svg>
  );
}

function Donut({ value, shown, color }: { value: number; shown: number; color: string }) {
  const r = 74;
  const C = 2 * Math.PI * r;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="sc-visual" aria-hidden="true">
      <g transform={`translate(${W / 2} ${H / 2}) rotate(-90)`}>
        <circle r={r} fill="none" stroke="var(--line-strong)" strokeWidth={17} />
        <circle r={r} fill="none" stroke={color} strokeWidth={17}
          strokeLinecap="round"
          strokeDasharray={`${Math.max(0.001, C * value)} ${C}`} />
      </g>
      <text x={W / 2} y={H / 2 + 9} textAnchor="middle" fill="var(--ink)"
        fontSize={30} fontWeight={700} fontFamily="var(--font-display)">
        {formatPercent(shown)}
      </text>
    </svg>
  );
}

function CityRow({ count, progress, color }: {
  count: number; progress: number; color: string;
}) {
  const total = Math.ceil(count);
  const cols = Math.min(total, 10);
  const gap = Math.min(44, (W - 60) / cols);
  const rows = Math.ceil(total / 10);
  const shownUnits = count * progress;
  const glyph = (i: number) => {
    const cx = (W - (cols - 1) * gap) / 2 + (i % 10) * gap;
    const cy = (rows === 1 ? H / 2 + 16 : H / 2 - 14 + Math.floor(i / 10) * 66);
    const fill = Math.min(1, Math.max(0.12, shownUnits - i));
    return (
      <g key={i} opacity={fill} transform={`translate(${cx - 15} ${cy - 26})`}>
        <rect x={0} y={14} width={12} height={26} rx={1.5} fill={color} />
        <rect x={14} y={0} width={9} height={40} rx={1.5} fill={color} />
        <rect x={25} y={20} width={7} height={20} rx={1.5} fill={color} />
      </g>
    );
  };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="sc-visual" aria-hidden="true">
      {Array.from({ length: total }, (_, i) => glyph(i))}
    </svg>
  );
}

function Timeline({ sinceMonth, nowMonth, progress, color, label }: {
  sinceMonth: string; nowMonth: string; progress: number; color: string; label: string;
}) {
  const y = H / 2 + 6;
  const x0 = 30;
  const x1 = W - 30;
  const startYear = Number(sinceMonth.slice(0, 4));
  const endYear = Number(nowMonth.slice(0, 4));
  const span = Math.max(1, endYear - startYear);
  const ticks: number[] = [];
  const stepY = span > 16 ? 4 : span > 8 ? 2 : 1;
  for (let yr = startYear; yr <= endYear; yr += stepY) ticks.push(yr);
  const tx = (yr: number) => x0 + ((yr - startYear) / span) * (x1 - x0);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="sc-visual" aria-hidden="true">
      <text x={W / 2} y={y - 46} textAnchor="middle" fill="var(--ink-dim)" fontSize={13.5}>
        {label}
      </text>
      <line x1={x0} x2={x1} y1={y} y2={y} stroke="var(--line-strong)" strokeWidth={7}
        strokeLinecap="round" />
      <line x1={x0} x2={x0 + (x1 - x0) * progress} y1={y} y2={y} stroke={color}
        strokeWidth={7} strokeLinecap="round" />
      {ticks.map((yr) => (
        <g key={yr}>
          <line x1={tx(yr)} x2={tx(yr)} y1={y + 8} y2={y + 13}
            stroke="var(--ink-faint)" strokeWidth={1.5} />
          <text x={tx(yr)} y={y + 30} textAnchor="middle" fill="var(--ink-faint)" fontSize={11}>
            {yr}
          </text>
        </g>
      ))}
      <circle cx={x0} cy={y} r={4} fill={color} />
      <text x={x0} y={y - 16} fill="var(--ink)" fontSize={12.5} fontWeight={600}>
        {formatMonth(sinceMonth)} {t('showcase.sinceYear')}
      </text>
    </svg>
  );
}

/* ---------- item assembly ---------- */

interface ShowcaseItem {
  key: string;
  label: string;
  color: string;
  finalText: string;
  animText: (p: number) => string;
  note: string;
  visual: (p: number) => ReactElement | null;
}

export function HeroShowcase() {
  const snapshot = useSnapshot()!;
  const kind = useAppStore((s) => s.kind);
  const entries = useHistoryEntries();
  const [activeState, setActiveState] = useState({ kind, idx: 0 });
  const active = activeState.kind === kind ? activeState.idx : 0;
  const setActive = useCallback(
    (v: number | ((a: number) => number)) =>
      setActiveState((prev) => {
        const cur = prev.kind === kind ? prev.idx : 0;
        return { kind, idx: typeof v === 'function' ? v(cur) : v };
      }),
    [kind],
  );
  const [paused, setPaused] = useState(false);
  const timer = useRef<number | null>(null);

  const items = useMemo<ShowcaseItem[]>(() => {
    const { national, month, praxes } = snapshot;
    const vacantCount = national.vacant;
    const rate = national.vacancyRate ?? 0;
    const popAll = national.populationVacant + national.populationDissolved;
    const median = entries.length
      ? entries[entries.length - 1].medianVacancyMonths ?? medianVacancyMonths(praxes, month)
      : medianVacancyMonths(praxes, month);
    const longest = longestVacant(praxes);
    const vSeries = vacantSeries(entries);
    const mSeries = medianSeries(entries);
    const range = entries.length > 1
      ? t('showcase.sparkNote', {
          first: formatMonth(entries[0].month),
          last: formatMonth(entries[entries.length - 1].month),
        })
      : '';
    const out: ShowcaseItem[] = [
      {
        key: 'vacant',
        label: tKind('hero.vacant', kind),
        color: 'var(--alert)',
        finalText: formatNumber(vacantCount),
        animText: (p) => formatNumber(Math.round(vacantCount * p)),
        note: range,
        visual: () => <Spark points={vSeries} color="var(--alert)" yFormat={formatNumber} />,
      },
    ];
    if (national.dissolved > 0) {
      out.push({
        key: 'dissolved',
        label: t('hero.dissolved'),
        color: 'var(--alert-soft)',
        finalText: formatNumber(national.dissolved),
        animText: (p) => formatNumber(Math.round(national.dissolved * p)),
        note: t('showcase.dissolvedNote'),
        visual: () => <DotMatrix n={national.dissolved} color="var(--alert-soft)" />,
      });
    }
    out.push(
      {
        key: 'rate',
        label: tKind('hero.vacancyRate', kind),
        color: 'var(--accent)',
        finalText: formatPercent(rate),
        animText: (p) => formatPercent(rate * p),
        note: national.totalDistricts !== null
          ? t('showcase.rateNote', { total: formatNumber(national.totalDistricts) })
          : '',
        visual: (p) => <Donut value={rate * p} shown={rate * p} color="var(--accent)" />,
      },
      {
        key: 'population',
        label: tKind('hero.populationAffected', kind),
        color: 'var(--accent)',
        finalText: formatNumber(popAll),
        animText: (p) => formatNumber(Math.round(popAll * p)),
        note: t('showcase.cityNote'),
        visual: (p) => (
          <CityRow count={popAll / SZOMBATHELY_POPULATION} progress={p} color="var(--accent)" />
        ),
      },
      {
        key: 'median',
        label: t('hero.medianVacancy'),
        color: 'var(--alert-soft)',
        finalText: formatDuration(median),
        animText: (p) => formatDuration(Math.round(median * p)),
        note: range,
        visual: () => (
          <Spark points={mSeries} color="var(--alert-soft)"
            yFormat={(v) => formatDuration(Math.round(v))} />
        ),
      },
    );
    if (longest) {
      const site = primarySite(longest);
      const months = monthsBetween(longest.vacantSince, month);
      out.push({
        key: 'longest',
        label: t('hero.longestVacancy'),
        color: 'var(--alert)',
        finalText: formatDuration(months),
        animText: (p) => formatDuration(Math.round(months * p)),
        note: t('showcase.longestNote', {
          settlement: site?.settlement ?? '',
          county: longest.county,
          type: t(`praxisTypes.${longest.type}`),
        }),
        visual: (p) => (
          <Timeline sinceMonth={longest.vacantSince} nowMonth={month} progress={p}
            color="var(--alert)" label={site?.settlement ?? ''} />
        ),
      });
    }
    return out;
  }, [snapshot, entries, kind]);

  const idx = Math.min(active, items.length - 1);
  const item = items[idx];

  useEffect(() => {
    if (paused) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    timer.current = window.setInterval(
      () => setActive((a) => (a + 1) % items.length),
      STEP_MS,
    );
    return () => {
      if (timer.current !== null) window.clearInterval(timer.current);
    };
  }, [items.length, paused, kind, setActive, active]);

  return (
    <div className="showcase" onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}>
      <div className="showcase__rail" role="tablist">
        {items.map((it, i) => (
          <button key={it.key} role="tab" aria-selected={i === idx}
            className={i === idx ? 'is-active' : ''}
            onClick={() => setActive(i)}>
            <strong style={{ color: it.color }}>{it.finalText}</strong>
            <span>{it.label}</span>
            {i === idx && !paused && (
              <i className="showcase__progress" key={`${kind}-${it.key}`}
                style={{ animationDuration: `${STEP_MS}ms` }} />
            )}
          </button>
        ))}
      </div>
      <ActivePanel key={`${kind}-${item.key}`} item={item} />
    </div>
  );
}
