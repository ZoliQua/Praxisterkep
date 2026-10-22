// "Mi függ össze mivel?" — the whole table of associations, and any one of
// them as a cloud.
//
// The matrix is the index; the scatter under it is the evidence. Clicking a
// cell draws that pair, so a reader never has to take a coefficient on trust.
// The switch swaps raw r for the partial r with income held still, or with
// income and education held still together, which is the honest version of
// most of these: poverty and schooling run under all of them.
import { useState } from 'react';
import { t } from '../lib/i18n';
import { formatDecimal, lowerFirst } from '../lib/format';
import {
  incomeThird, metaOf, pairOf, partialOf, strengthOf, useOutcomes, valueOf, type Control,
} from '../lib/outcomes';
import { CorrMatrix } from './charts/CorrMatrix';
import { OutcomeScatter, type ScatterPoint } from './charts/OutcomeScatter';

const ROWS = ['gpRate', 'gpLongTerm', 'dentalRate', 'gpMinutes', 'sboMinutes'];
const COLS = ['avoidable', 'amenable', 'allCause', 'income', 'degree', 'employed',
  'jobseekers', 'noDigital', 'poorHousing', 'elderlyOnly', 'naturalChange', 'migration',
  'gpLoad', 'diabetes', 'hypertension', 'ischaemic', 'development'];
const CONTROLS: Control[] = ['none', 'income', 'incomeDegree'];

export function LinksSection() {
  const o = useOutcomes();
  const [control, setControl] = useState<Control>('none');
  const [active, setActive] = useState<{ x: string; y: string }>({ x: 'gpRate', y: 'gpLoad' });
  if (!o) return null;
  // a measure with no pair in the data is not offered: the ETL withholds a
  // series KSH answers with another one's figures (TYWJ013 = TYWJ012)
  const cols = COLS.filter((k) => ROWS.some((r) => pairOf(o, r, k)));
  const third = incomeThird(o.districts);
  const { x, y } = active;
  const points: ScatterPoint[] = o.districts
    .filter((r) => !r.capital && valueOf(r, x) !== null && valueOf(r, y) !== null)
    .map((r) => ({ id: r.name, label: r.name, sub: r.county, x: valueOf(r, x) as number,
      y: valueOf(r, y) as number, size: r.population, group: third(r) }));
  const pair = pairOf(o, x, y);
  const part = partialOf(o, x, y, 'income');
  const part2 = partialOf(o, x, y, 'incomeDegree');

  return (
    <section className="section container outcome" id="osszefuggesek">
      <h2 className="section__heading">{t('outcomes.links.heading')}</h2>
      <p className="section__lead">{t('outcomes.links.lead')}</p>
      <div className="seg outcome__switch" role="group" aria-label={t('outcomes.links.controlLabel')}>
        {CONTROLS.map((c) => (
          <button key={c} type="button" aria-pressed={control === c} onClick={() => setControl(c)}>
            {t(`outcomes.links.control.${c}`)}
          </button>
        ))}
      </div>
      <p className="section__explain">{t(`outcomes.links.controlExplain.${control}`)}</p>
      <CorrMatrix data={o} rows={ROWS} cols={cols} control={control} active={active}
        onPick={(a, b) => setActive({ x: a, y: b })} />
      {!cols.includes('ischaemic') && <p className="outcome__hint">{t('outcomes.links.ischaemicWithheld')}</p>}
      <div className="corr-matrix__key">
        <span><i className="is-pos" />{t('outcomes.links.keyPos')}</span>
        <span><i className="is-neg" />{t('outcomes.links.keyNeg')}</span>
        <span><i className="is-weak" />{t('outcomes.links.keyWeak')}</span>
      </div>

      <h3 className="outcome__sub">{t('outcomes.links.pairHeading', {
        x: t(`outcomes.measure.${x}`), y: lowerFirst(t(`outcomes.measure.${y}`)),
      })}</h3>
      <OutcomeScatter points={points}
        xLabel={t(`outcomes.measure.${x}`)} yLabel={t(`outcomes.measure.${y}`)}
        xFormat={metaOf(x).format} yFormat={metaOf(y).format}
        groupLabels={[t('outcomes.third.0'), t('outcomes.third.1'), t('outcomes.third.2')]} />
      {pair && (
        <p className="outcome__finding">
          {t('outcomes.links.pairFinding', {
            strength: t(`outcomes.strength.${strengthOf(pair.r)}`),
            r: formatDecimal(pair.r.toFixed(2)),
            rho: formatDecimal(pair.rho.toFixed(2)),
            n: pair.n,
          })}
          {part && ` ${t('outcomes.links.pairPartial', { r: formatDecimal(part.partial.toFixed(2)) })}`}
          {part2 && ` ${t('outcomes.links.pairPartial2', { r: formatDecimal(part2.partial.toFixed(2)) })}`}
        </p>
      )}
      <p className="notice">{t('outcomes.links.caveat')}{' '}
        <a href="modszertan.html#kimenetek">{t('outcomes.methodLink')}</a></p>
    </section>
  );
}
