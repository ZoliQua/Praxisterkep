// How the outcome numbers are made — one heading per source and one for the
// statistics, so a reader who doubts a figure on the analysis page can find
// in a minute where it came from and what it cannot say.
//
// The few numbers the text quotes come from outcomes.json itself, so the
// method page cannot fall a month behind the analysis it describes.
import { t } from '../lib/i18n';
import { formatDecimal, formatNumber } from '../lib/format';
import { pairOf, partialOf, pValue, useOutcomes } from '../lib/outcomes';

const ITEMS = ['mortality', 'whyNotKsh', 'income', 'jobs', 'population', 'census', 'stats',
  'education', 'grid', 'capital', 'sbo', 'grants', 'forecast', 'cross', 'notAvailable',
  'limits'] as const;

export function OutcomeMethod() {
  const o = useOutcomes();
  const r2 = (v: number | undefined) => (v === undefined ? '–' : formatDecimal(v.toFixed(2)));
  const raw = o ? pairOf(o, 'gpRate', 'avoidable') : null;
  const inc = o ? partialOf(o, 'gpRate', 'avoidable', 'income') : null;
  const both = o ? partialOf(o, 'gpRate', 'avoidable', 'incomeDegree') : null;
  const bt = o?.forecast.kinds.gp.backtest;
  const vars: Record<string, Record<string, string>> = {
    education: { raw: r2(raw?.r), income: r2(inc?.partial), both: r2(both?.partial),
      p: both ? pValue(both.p) : '–' },
    forecast: {
      from: bt?.from ?? '–', to: bt?.to ?? '–',
      newPred: bt ? formatDecimal(bt.newPredicted.toFixed(0)) : '–',
      newAct: bt ? formatNumber(bt.newActual) : '–',
      fillPred: bt ? formatDecimal(bt.refillsPredicted.toFixed(0)) : '–',
      fillAct: bt ? formatNumber(bt.refillsActual) : '–',
    },
  };
  return (
    <section className="section container method" id="kimenetek">
      <h2 className="section__heading">{t('outcomeMethod.heading')}</h2>
      <p className="section__lead">{t('outcomeMethod.lead')}</p>
      {ITEMS.map((k) => (
        <div key={k} className="method__item">
          <h3 className="why__chain-title">{t(`outcomeMethod.${k}.title`)}</h3>
          <p>{t(`outcomeMethod.${k}.text`, vars[k] ?? {})}</p>
        </div>
      ))}
    </section>
  );
}
