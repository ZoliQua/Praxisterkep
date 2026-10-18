// Any two measures of the chosen countries, one dot each, and nothing
// fitted through them: with nine or twenty-eight countries a correlation
// coefficient says more about which countries were picked than about care.
// The chart is for seeing where a country sits, and the medians drawn across
// it split the field into four corners a reader can name.
import { useState } from 'react';
import { t } from '../../lib/i18n';

export interface EuPoint { geo: string; x: number; y: number; label: string }

const W = 760;
const H = 420;
const PAD = { top: 20, right: 24, bottom: 46, left: 64 };

function median(vs: number[]): number {
  const s = [...vs].sort((a, b) => a - b);
  const m = s.length / 2;
  return s.length % 2 ? s[Math.floor(m)] : (s[m - 1] + s[m]) / 2;
}

function ticks(lo: number, hi: number): number[] {
  const raw = (hi - lo) / 4 || 1;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}

export function EuScatter({ points, xLabel, yLabel, xFormat, yFormat, focus, onFocus }: {
  points: EuPoint[];
  xLabel: string;
  yLabel: string;
  xFormat: (v: number) => string;
  yFormat: (v: number) => string;
  focus: string;
  onFocus: (geo: string) => void;
}) {
  const [hover, setHover] = useState<string | null>(null);
  if (points.length < 3) return <p className="section__explain">{t('europe.scatter.tooFew')}</p>;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const pad = (lo: number, hi: number) => { const d = (hi - lo) * 0.08 || 1; return [lo - d, hi + d]; };
  const [x0, x1] = pad(Math.min(...xs), Math.max(...xs));
  const [y0, y1] = pad(Math.min(...ys), Math.max(...ys));
  const px = (v: number) => PAD.left + ((v - x0) / (x1 - x0)) * (W - PAD.left - PAD.right);
  const py = (v: number) => H - PAD.bottom - ((v - y0) / (y1 - y0)) * (H - PAD.top - PAD.bottom);
  const mx = median(xs);
  const my = median(ys);
  const on = hover ?? focus;
  return (
    <svg className="eu-scatter" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${xLabel} – ${yLabel}`}>
      {ticks(x0, x1).map((v) => (
        <g key={`x${v}`}>
          <line x1={px(v)} x2={px(v)} y1={PAD.top} y2={H - PAD.bottom} className="eu-scatter__grid" />
          <text x={px(v)} y={H - PAD.bottom + 16} textAnchor="middle">{xFormat(v)}</text>
        </g>
      ))}
      {ticks(y0, y1).map((v) => (
        <g key={`y${v}`}>
          <line x1={PAD.left} x2={W - PAD.right} y1={py(v)} y2={py(v)} className="eu-scatter__grid" />
          <text x={PAD.left - 8} y={py(v) + 4} textAnchor="end">{yFormat(v)}</text>
        </g>
      ))}
      <line x1={px(mx)} x2={px(mx)} y1={PAD.top} y2={H - PAD.bottom} className="eu-scatter__median" />
      <line x1={PAD.left} x2={W - PAD.right} y1={py(my)} y2={py(my)} className="eu-scatter__median" />
      <text x={W - PAD.right} y={H - 8} textAnchor="end" className="eu-scatter__axis">{xLabel} →</text>
      <text x={PAD.left} y={PAD.top - 6} className="eu-scatter__axis">↑ {yLabel}</text>
      {points.map((p) => (
        <g key={p.geo} className={`eu-scatter__dot${p.geo === on ? ' is-on' : ''}${p.geo === 'HU' ? ' is-hu' : ''}`}
          onMouseEnter={() => setHover(p.geo)} onMouseLeave={() => setHover(null)}
          onClick={() => onFocus(p.geo)}>
          <circle cx={px(p.x)} cy={py(p.y)} r={p.geo === 'HU' || p.geo === on ? 7 : 5}>
            <title>{`${p.label}: ${xFormat(p.x)} · ${yFormat(p.y)}`}</title>
          </circle>
          <text x={px(p.x) + 9} y={py(p.y) + 4}>{p.geo === on || p.geo === 'HU' || points.length <= 10 ? p.label : p.geo}</text>
        </g>
      ))}
    </svg>
  );
}
