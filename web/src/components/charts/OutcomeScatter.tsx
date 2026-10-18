// Any two measures of the járás, one dot each.
//
// The question it answers is always "do these two move together?", so the
// dots carry three more things a reader needs before believing a cloud: how
// many people each járás holds (the radius), which income third it belongs
// to (the colour — the confounder every reading here has to be held against)
// and the least-squares line through what is drawn, with r beside it.
//
// The fit is computed from the dots on screen, not taken from the stored
// pair: the pair is symmetric in r but not in slope, and a line regressed
// the wrong way round looks right and is wrong.
import { useMemo, useState } from 'react';
import { t } from '../../lib/i18n';
import { formatDecimal } from '../../lib/format';
import { GROUP_COLORS } from '../../lib/outcomes';

export interface ScatterPoint {
  id: string;
  label: string;
  sub?: string;
  x: number;
  y: number;
  size: number;
  /** 0, 1, 2 — e.g. the income third; null draws it neutral */
  group: number | null;
}

const W = 760;
const H = 400;
const PAD = { top: 26, right: 20, bottom: 48, left: 60 };

function niceTicks(lo: number, hi: number, count = 5): number[] {
  const span = hi - lo || 1;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) ?? step0;
  const start = Math.ceil(lo / step) * step;
  const out: number[] = [];
  for (let v = start; v <= hi + step * 1e-9; v += step) out.push(Number(v.toFixed(10)));
  return out;
}

function leastSquares(pts: ScatterPoint[]) {
  const n = pts.length;
  const mx = pts.reduce((a, p) => a + p.x, 0) / n;
  const my = pts.reduce((a, p) => a + p.y, 0) / n;
  let sxy = 0; let sxx = 0; let syy = 0;
  for (const p of pts) {
    sxy += (p.x - mx) * (p.y - my); sxx += (p.x - mx) ** 2; syy += (p.y - my) ** 2;
  }
  const slope = sxx ? sxy / sxx : 0;
  return { slope, intercept: my - slope * mx, r: sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0 };
}

export function OutcomeScatter({
  points, xLabel, yLabel, xFormat, yFormat, groupLabels, selected, highlight, onPick, note,
}: {
  points: ScatterPoint[];
  xLabel: string;
  yLabel: string;
  xFormat: (v: number) => string;
  yFormat: (v: number) => string;
  groupLabels?: [string, string, string];
  selected?: string | null;
  /** a set of ids to keep bright; everything else dims */
  highlight?: Set<string> | null;
  onPick?: (id: string) => void;
  /** a sentence under the chart */
  note?: string;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const geom = useMemo(() => {
    if (points.length < 3) return null;
    const xs = points.map((p) => p.x); const ys = points.map((p) => p.y);
    const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
    const [y0, y1] = [Math.min(...ys), Math.max(...ys)];
    const padX = (x1 - x0) * 0.04 || 1; const padY = (y1 - y0) * 0.06 || 1;
    const dom = { x0: x0 - padX, x1: x1 + padX, y0: y0 - padY, y1: y1 + padY };
    const px = (v: number) => PAD.left + ((v - dom.x0) / (dom.x1 - dom.x0)) * (W - PAD.left - PAD.right);
    const py = (v: number) => H - PAD.bottom - ((v - dom.y0) / (dom.y1 - dom.y0)) * (H - PAD.top - PAD.bottom);
    const maxS = Math.max(...points.map((p) => p.size), 1);
    const pr = (s: number) => 2.4 + Math.sqrt(s / maxS) * 8;
    return { dom, px, py, pr, fit: leastSquares(points),
      tx: niceTicks(dom.x0, dom.x1), ty: niceTicks(dom.y0, dom.y1) };
  }, [points]);
  if (!geom) return null;
  const { dom, px, py, pr, fit, tx, ty } = geom;
  const shown = points.find((p) => p.id === (hover ?? selected));
  // largest first, so the small járás are drawn on top and stay hoverable
  const order = [...points].sort((a, b) => b.size - a.size);

  return (
    <figure className="outcome-scatter">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${xLabel} – ${yLabel}`}
        onPointerLeave={() => setHover(null)}>
        {ty.map((v) => (
          <g key={`y${v}`}>
            <line x1={PAD.left} x2={W - PAD.right} y1={py(v)} y2={py(v)} className="grid" />
            <text x={PAD.left - 8} y={py(v)} textAnchor="end" dominantBaseline="middle"
              className="tick">{yFormat(v)}</text>
          </g>
        ))}
        {tx.map((v) => (
          <text key={`x${v}`} x={px(v)} y={H - PAD.bottom + 18} textAnchor="middle"
            className="tick">{xFormat(v)}</text>
        ))}
        <text x={(PAD.left + W - PAD.right) / 2} y={H - 8} textAnchor="middle"
          className="axis-label">{xLabel}</text>
        <text x={14} y={PAD.top - 10} className="axis-label">{yLabel}</text>
        {/* the fit, drawn across the range of x that has dots */}
        <line className="fit"
          x1={px(dom.x0)} y1={py(fit.intercept + fit.slope * dom.x0)}
          x2={px(dom.x1)} y2={py(fit.intercept + fit.slope * dom.x1)} />
        {order.map((p) => {
          const dim = highlight ? !highlight.has(p.id) : false;
          const on = p.id === selected || p.id === hover;
          return (
            <circle key={p.id} cx={px(p.x)} cy={py(p.y)} r={pr(p.size)}
              className={`dot${on ? ' is-on' : ''}${dim ? ' is-dim' : ''}${onPick ? ' is-clickable' : ''}`}
              fill={p.group === null ? 'var(--ink-faint)' : GROUP_COLORS[p.group]}
              onPointerEnter={() => setHover(p.id)}
              onClick={onPick ? () => onPick(p.id) : undefined}>
              <title>{`${p.label}: ${xFormat(p.x)} · ${yFormat(p.y)}`}</title>
            </circle>
          );
        })}
        <text x={W - PAD.right} y={PAD.top - 10} textAnchor="end" className="fit-label">
          r = {formatDecimal(fit.r.toFixed(2))} · n = {points.length}
        </text>
        {shown && (
          <g className="readout" aria-hidden="true">
            <rect x={PAD.left + 8} y={PAD.top + 4} width={250} height={58} rx={7} />
            <text x={PAD.left + 20} y={PAD.top + 24} className="readout__name">{shown.label}</text>
            {shown.sub && (
              <text x={PAD.left + 20} y={PAD.top + 40} className="readout__sub">{shown.sub}</text>
            )}
            <text x={PAD.left + 20} y={PAD.top + 55} className="readout__vals">
              {xFormat(shown.x)} · {yFormat(shown.y)}
            </text>
          </g>
        )}
      </svg>
      <figcaption className="outcome-scatter__legend">
        {groupLabels && groupLabels.map((g, i) => (
          <span key={g}><i style={{ background: GROUP_COLORS[i] }} />{g}</span>
        ))}
        <span className="outcome-scatter__size">{t('outcomes.scatter.size')}</span>
        {note && <span className="outcome-scatter__note">{note}</span>}
      </figcaption>
    </figure>
  );
}
