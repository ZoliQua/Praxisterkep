// Horizontal vacancy timeline for one settlement's vacant/dissolved
// districts: one bar per praxis from vacantSince to the current data month.
// Every bar is derived from sourced snapshot fields (vacantSince,
// longTermSince) — nothing is interpolated.
import { t } from '../lib/i18n';
import { formatMonth, monthsBetween } from '../lib/format';
import type { Praxis } from '../types';

const W = 640;
const ROW_H = 24;
const PAD = { top: 6, right: 46, bottom: 20, left: 78 };

function monthIndex(m: string): number {
  return parseInt(m.slice(0, 4), 10) * 12 + parseInt(m.slice(5, 7), 10) - 1;
}

export function SettlementTimeline({ praxes, month }: {
  praxes: Praxis[]; month: string;
}) {
  const withSince = praxes.filter((p) => p.vacantSince);
  if (withSince.length === 0) return null;

  const end = monthIndex(month);
  const startYear = Math.min(
    ...withSince.map((p) => parseInt(p.vacantSince.slice(0, 4), 10)),
  );
  const start = startYear * 12; // January of the earliest year
  const span = Math.max(end - start, 12);
  const innerW = W - PAD.left - PAD.right;
  const xAt = (mi: number) => PAD.left + ((mi - start) / span) * innerW;
  const h = PAD.top + withSince.length * ROW_H + PAD.bottom;

  // year ticks, thinned so labels never collide
  const years: number[] = [];
  const step = Math.max(1, Math.ceil((Math.floor(end / 12) - startYear) / 8));
  for (let y = startYear; y * 12 <= end; y += step) years.push(y);

  return (
    <div className="settlement-timeline">
      <h4 className="settlement-card__subhead">{t('search.timelineTitle')}</h4>
      <svg viewBox={`0 0 ${W} ${h}`} role="img" aria-label={t('search.timelineTitle')}>
        {years.map((y) => (
          <g key={y}>
            <line x1={xAt(y * 12)} x2={xAt(y * 12)} y1={PAD.top}
              y2={h - PAD.bottom + 4} stroke="var(--line)" strokeWidth={1} />
            <text x={xAt(y * 12)} y={h - 6} fill="var(--ink-faint)" fontSize="10.5">
              {y}
            </text>
          </g>
        ))}
        {withSince.map((p, i) => {
          const y = PAD.top + i * ROW_H;
          const x0 = xAt(monthIndex(p.vacantSince));
          const x1 = xAt(end);
          const color = p.status === 'dissolved' ? 'var(--alert-soft)' : 'var(--alert)';
          return (
            <g key={p.id}>
              <text x={PAD.left - 8} y={y + ROW_H / 2 + 3.5} textAnchor="end"
                fill="var(--ink-dim)" fontSize="11.5">
                {t(`praxisTypes.${p.type}`)}
              </text>
              <line x1={PAD.left} x2={W - PAD.right} y1={y + ROW_H / 2}
                y2={y + ROW_H / 2} stroke="var(--line)" strokeWidth={1} />
              <rect x={x0} y={y + ROW_H / 2 - 5} width={Math.max(x1 - x0, 3)}
                height={10} rx={5} fill={color} opacity={0.55} />
              {p.longTermSince && (
                <rect x={xAt(monthIndex(p.longTermSince))} y={y + ROW_H / 2 - 5}
                  width={Math.max(x1 - xAt(monthIndex(p.longTermSince)), 3)}
                  height={10} rx={5} fill={color} />
              )}
              <circle cx={x0} cy={y + ROW_H / 2} r={3.4} fill={color} />
              <text x={x1 + 6} y={y + ROW_H / 2 + 3.5} fill="var(--ink-faint)"
                fontSize="10.5">
                {Math.floor(monthsBetween(p.vacantSince, month) / 12)}+ {t('search.timelineYears')}
              </text>
              <title>
                {`${t(`praxisTypes.${p.type}`)} · ${formatMonth(p.vacantSince)} → ${formatMonth(month)}`}
              </title>
            </g>
          );
        })}
      </svg>
      <p className="praxis-line praxis-line--faint">{t('search.timelineNote')}</p>
    </div>
  );
}
