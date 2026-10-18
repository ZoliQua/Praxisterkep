// Two measures against each other, any two the page carries.
import { useState } from 'react';
import { t } from '../../lib/i18n';
import { formatValue, latest, sectionIndicators, type EuSection } from '../../lib/europe';
import { EuScatter, type EuPoint } from './EuScatter';
import type { EuView } from './IndicatorSection';

const SECTIONS: EuSection[] = ['needs', 'workforce', 'access', 'outcomes', 'spending', 'pay'];
const DEFAULTS: Record<'gp' | 'dental', [string, string]> = {
  gp: ['gpDensity', 'avoidable'],
  dental: ['dentistDensity', 'dentVisit'],
};

export function EuTwoMeasures({ view }: { view: EuView }) {
  const { raw, kind, members, focus, onFocus, nameOf } = view;
  const keys = SECTIONS.flatMap((s) => sectionIndicators(raw, s, kind));
  const [xKey, setX] = useState<string | null>(null);
  const [yKey, setY] = useState<string | null>(null);
  const xk = xKey && keys.includes(xKey) ? xKey : DEFAULTS[kind][0];
  const yk = yKey && keys.includes(yKey) ? yKey : DEFAULTS[kind][1];
  const xi = raw.indicators[xk];
  const yi = raw.indicators[yk];
  const points: EuPoint[] = [];
  for (const g of members) {
    const a = latest(xi.values[g]);
    const b = latest(yi.values[g]);
    if (a && b) points.push({ geo: g, x: a.value, y: b.value, label: nameOf(g) });
  }
  const select = (value: string, set: (v: string) => void, label: string) => (
    <label className="eu-select">
      <span>{label}</span>
      <select value={value} onChange={(e) => set(e.target.value)}>
        {SECTIONS.map((s) => {
          const own = keys.filter((k) => raw.indicators[k].section === s);
          return own.length ? (
            <optgroup key={s} label={t(`europe.section.${s}.short`)}>
              {own.map((k) => <option key={k} value={k}>{t(`europe.ind.${k}.short`)}</option>)}
            </optgroup>
          ) : null;
        })}
      </select>
    </label>
  );
  return (
    <section className="section container eu-section" id="ketmutato">
      <h2 className="section__heading">{t('europe.scatter.heading')}</h2>
      <p className="section__lead">{t('europe.scatter.lead')}</p>
      <div className="eu-selects">
        {select(xk, setX, t('europe.scatter.x'))}
        {select(yk, setY, t('europe.scatter.y'))}
      </div>
      <EuScatter points={points} focus={focus} onFocus={onFocus}
        xLabel={t(`europe.ind.${xk}.short`)} yLabel={t(`europe.ind.${yk}.short`)}
        xFormat={(v) => formatValue(xi.unit, v)} yFormat={(v) => formatValue(yi.unit, v)} />
      <p className="outcome__hint">{t('europe.scatter.note', { n: points.length })}</p>
    </section>
  );
}
