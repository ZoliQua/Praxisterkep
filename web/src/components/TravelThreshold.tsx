// The dial under the travel-time map: pick the number of minutes you think is
// acceptable, and the page says who lives outside it.
//
// The fixed 10/20/30 bands are the right summary of the country and the wrong
// tool for a reader, because nobody's threshold is exactly thirty. The map
// above follows the same dial: settlements beyond it are the ones lit.
import { useMemo } from 'react';
import { t } from '../lib/i18n';
import { formatNumber, formatPercent } from '../lib/format';
import { beyond, curve, THRESHOLDS } from '../lib/threshold';
import type { Layer, TravelRaw } from '../lib/mobility';

const W = 320;
const H = 54;

/** "0,0%" would say nothing where a handful of people are involved. */
function share(part: number, whole: number): string {
  if (!whole || !part) return formatPercent(0);
  const value = part / whole;
  return value < 0.001 ? `<${formatPercent(0.001)}` : formatPercent(value);
}

export function TravelThreshold({ data, layer, minutes, onMinutes }: {
  data: TravelRaw | null;
  layer: Layer;
  minutes: number;
  onMinutes: (minutes: number) => void;
}) {
  const result = useMemo(() => beyond(data, layer, minutes), [data, layer, minutes]);
  const points = useMemo(() => curve(data, layer), [data, layer]);
  if (!result) return null;

  const max = Math.max(...points.map((p) => p.population), 1);
  const x = (i: number) => (i / (points.length - 1)) * (W - 8) + 4;
  const y = (v: number) => H - 6 - (v / max) * (H - 12);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${
    y(p.population).toFixed(1)}`).join('');
  const here = THRESHOLDS.indexOf(minutes as typeof THRESHOLDS[number]);

  return (
    <div className="threshold">
      <div className="threshold__dial">
        <label htmlFor="threshold-range">{t('threshold.label')}</label>
        <input id="threshold-range" type="range" min={0} max={THRESHOLDS.length - 1}
          step={1} value={here < 0 ? 3 : here}
          onChange={(e) => onMinutes(THRESHOLDS[Number(e.target.value)])}
          aria-valuetext={t('travel.minutes', { n: String(minutes) })} />
        <output>{t('travel.minutes', { n: String(minutes) })}</output>
      </div>

      <p className="threshold__answer">
        <strong>{formatNumber(result.population)}</strong>
        {' '}{t('threshold.people', {
          // Hungarian wants a case ending, not a hyphen and a guess
          layer: t(`travel.layerFrom.${layer}`),
          minutes: String(minutes),
        })}
        {' '}<span className="threshold__of">{t('threshold.of', {
          share: share(result.population, result.ofPopulation),
          settlements: formatNumber(result.settlements),
        })}</span>
      </p>

      <svg className="threshold__curve" viewBox={`0 0 ${W} ${H}`} role="img"
        aria-label={t('threshold.curveLabel')}>
        <path d={`${path}L${x(points.length - 1).toFixed(1)} ${H - 6}L4 ${H - 6}Z`}
          fill="var(--accent)" fillOpacity="0.14" />
        <path d={path} fill="none" stroke="var(--accent)" strokeWidth="1.6" />
        {here >= 0 && (
          <g>
            <line x1={x(here)} y1="2" x2={x(here)} y2={H - 6}
              stroke="var(--ink-faint)" strokeDasharray="3 3" />
            <circle cx={x(here)} cy={y(points[here].population)} r="3.5"
              fill="var(--accent)" />
          </g>
        )}
      </svg>

      {result.worst.length > 0 && (
        <p className="threshold__worst">
          {t('threshold.worst')}{' '}
          {result.worst.map((w, i) => (
            <span key={`${w.settlement}-${w.county}`}>
              {i > 0 && ' · '}
              <strong>{w.settlement}</strong>{' '}
              <em>({t('travel.minutes', { n: String(w.minutes) })})</em>
            </span>
          ))}
        </p>
      )}
      {result.unreachable > 0 && (
        <p className="threshold__note">{t('threshold.unreachable', {
          n: formatNumber(result.unreachable),
        })}</p>
      )}
    </div>
  );
}
