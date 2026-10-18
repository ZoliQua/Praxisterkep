// Twenty counties over time, one of them in focus.
//
// Twenty coloured lines are a plate of spaghetti; twenty grey lines with one
// in colour are a comparison. So every county is drawn, faint, and the one
// the reader picks (or hovers in the list) is drawn on top with its values;
// a reference line — the median járás, or the national figure — is dashed.
// The vertical scale starts where the data does, and zero is drawn whenever
// it is inside it: a natural decrease is a negative number and must look it.
import { useMemo, useState } from 'react';
import { t } from '../../lib/i18n';
import { formatMonth } from '../../lib/format';

export interface TrendSeries { key: string; label: string; values: (number | null)[] }

const W = 760;
const H = 300;
const PAD = { top: 18, right: 18, bottom: 34, left: 58 };

function ticks(lo: number, hi: number): number[] {
  const span = hi - lo || 1;
  const raw = span / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}

/** "2019-03" -> months since year 0, so an uneven sampling keeps its spacing */
function monthNumber(m: string): number {
  const [y, mo] = m.split('-').map(Number);
  return y * 12 + (mo - 1);
}

export function TrendLines({ labels, series, reference, focus, onFocus, format, tickLabel, minSpan }: {
  /** the x positions, in order: years ("2012") or months ("2019-03"). Months
   *  are placed on a true time axis — a quarterly stretch followed by a
   *  monthly one must not look like the same span of time. */
  labels: string[];
  series: TrendSeries[];
  /** the dashed comparison line */
  reference?: TrendSeries;
  focus: string | null;
  onFocus?: (key: string | null) => void;
  format: (v: number) => string;
  /** how a label is written under the axis; return '' to skip one */
  tickLabel?: (label: string, i: number) => string;
  /** the least the vertical axis may span. A line moving between 97% and
   *  103% must not be blown up to fill the frame and read as a swing. */
  minSpan?: number;
}) {
  const [hoverI, setHoverI] = useState<number | null>(null);
  const geom = useMemo(() => {
    const all = [...series, ...(reference ? [reference] : [])]
      .flatMap((s) => s.values).filter((v): v is number => v !== null);
    if (!all.length) return null;
    let lo = Math.min(...all); let hi = Math.max(...all);
    if (minSpan && hi - lo < minSpan) {
      const mid = (hi + lo) / 2;
      lo = mid - minSpan / 2; hi = mid + minSpan / 2;
    }
    const pad = (hi - lo) * 0.06 || 1;
    lo -= pad; hi += pad;
    const n = labels.length;
    const monthly = labels.every((l) => /^\d{4}-\d{2}$/.test(l));
    const pos = monthly ? labels.map(monthNumber) : labels.map((_, i) => i);
    const p0 = pos[0]; const p1 = pos[n - 1];
    const px = (i: number) => PAD.left
      + (p1 > p0 ? (pos[i] - p0) / (p1 - p0) : 0.5) * (W - PAD.left - PAD.right);
    // on a month axis the year ticks sit at each January, whether or not a
    // sample falls there
    const yearTicks = monthly
      ? Array.from({ length: Math.floor(p1 / 12) - Math.ceil(p0 / 12) + 1 },
        (_, k) => Math.ceil(p0 / 12) + k).map((y) => ({
        x: PAD.left + ((y * 12 - p0) / (p1 - p0)) * (W - PAD.left - PAD.right), label: String(y) }))
      : null;
    const py = (v: number) => H - PAD.bottom - ((v - lo) / (hi - lo)) * (H - PAD.top - PAD.bottom);
    const path = (vals: (number | null)[]) => {
      let d = ''; let pen = false;
      vals.forEach((v, i) => {
        if (v === null) { pen = false; return; }
        d += `${pen ? 'L' : 'M'}${px(i).toFixed(1)},${py(v).toFixed(1)}`; pen = true;
      });
      return d;
    };
    return { lo, hi, px, py, path, ty: ticks(lo, hi), yearTicks, pos, p0, p1, monthly };
  }, [labels, series, reference, minSpan]);
  if (!geom) return null;
  const { lo, hi, px, py, path, ty, yearTicks, pos, p0, p1, monthly } = geom;
  const focused = series.find((s) => s.key === focus) ?? null;
  const step = Math.max(1, Math.ceil(labels.length / 9));

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    const f = Math.max(0, Math.min(1, (x - PAD.left) / (W - PAD.left - PAD.right)));
    // the nearest sample in time, not the nearest index
    const target = p0 + f * (p1 - p0);
    let best = 0;
    pos.forEach((v, i) => { if (Math.abs(v - target) < Math.abs(pos[best] - target)) best = i; });
    setHoverI(best);
  }

  return (
    <div className="trend-lines">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" onPointerMove={onMove}
        onPointerLeave={() => setHoverI(null)}>
        {ty.map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={py(v)} y2={py(v)} className="grid" />
            <text x={PAD.left - 8} y={py(v)} textAnchor="end" dominantBaseline="middle"
              className="tick">{format(v)}</text>
          </g>
        ))}
        {lo < 0 && hi > 0 && (
          <line x1={PAD.left} x2={W - PAD.right} y1={py(0)} y2={py(0)} className="zero" />
        )}
        {yearTicks
          ? yearTicks.map((tk) => (
            <g key={tk.label}>
              <line x1={tk.x} x2={tk.x} y1={H - PAD.bottom} y2={H - PAD.bottom + 4} className="grid" />
              <text x={tk.x} y={H - 12} textAnchor="middle" className="tick">{tk.label}</text>
            </g>
          ))
          : labels.map((l, i) => {
            const text = tickLabel ? tickLabel(l, i) : (i % step === 0 || i === labels.length - 1 ? l : '');
            return text ? (
              <text key={l} x={px(i)} y={H - 12} textAnchor="middle" className="tick">{text}</text>
            ) : null;
          })}
        {series.map((s) => (
          <path key={s.key} d={path(s.values)}
            className={`line${s.key === focus ? ' is-focus' : ''}`}
            onPointerEnter={onFocus ? () => onFocus(s.key) : undefined} />
        ))}
        {reference && <path d={path(reference.values)} className="line is-reference" />}
        {focused && <path d={path(focused.values)} className="line is-focus is-top" />}
        {hoverI !== null && (
          <g className="hover">
            <line x1={px(hoverI)} x2={px(hoverI)} y1={PAD.top} y2={H - PAD.bottom} />
            {[focused, reference].map((s, k) => {
              const v = s?.values[hoverI];
              return s && v !== null && v !== undefined ? (
                <circle key={k} cx={px(hoverI)} cy={py(v)} r={4}
                  className={k ? 'pt is-reference' : 'pt'} />
              ) : null;
            })}
          </g>
        )}
      </svg>
      <div className="trend-lines__readout">
        <b>{(() => {
          const l = hoverI !== null ? labels[hoverI] : labels[labels.length - 1];
          return monthly ? formatMonth(l) : l;
        })()}</b>
        {[focused, reference].map((s, k) => {
          if (!s) return null;
          const i = hoverI ?? labels.length - 1;
          const v = s.values[i];
          return (
            <span key={k} className={k ? 'is-reference' : 'is-focus'}>
              {s.label}: {v === null || v === undefined ? '–' : format(v)}
            </span>
          );
        })}
        {!focused && <span className="trend-lines__hint">{t('outcomes.trend.hint')}</span>}
      </div>
    </div>
  );
}
