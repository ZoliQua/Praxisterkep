// "Túlélés-elemzés": how long a vacancy actually lasts. The stock figure —
// how many districts are vacant today — cannot tell a three-month handover
// from a fifteen-year hole; the Kaplan–Meier curve can, and it keeps the
// spells that are still open instead of dropping them.
import { useMemo, useState } from 'react';
import { t, tKind } from '../lib/i18n';
import { formatNumber, formatPercent } from '../lib/format';
import { sortRows } from '../lib/eesztTable';
import {
  CURVE_COLORS, SPELL_COLUMNS, type Curve, spellRows, useSurvival,
} from '../lib/analysis';
import { SurvivalChart, type SurvivalSeries } from './charts/SurvivalChart';
import { DataTableModal } from './DataTableModal';
import type { PraxisKind } from '../types';

type Split = 'overall' | 'byPopulation' | 'byType' | 'byBenefit' | 'byCounty';
const SPLITS: Split[] = ['overall', 'byPopulation', 'byType', 'byBenefit', 'byCounty'];

function label(split: Split, key: string | undefined): string {
  if (!key) return t('survival.all');
  if (split === 'byType') return t(`praxisTypes.${key}`);
  if (split === 'byBenefit') return t(key === 'True' ? 'benefit.group.benefit' : 'benefit.group.other');
  if (split === 'byPopulation') return t(`risk.level.${key}`, undefined) || key;
  return key;
}

export function SurvivalSection({ kind }: { kind: PraxisKind }) {
  const data = useSurvival();
  const [split, setSplit] = useState<Split>('overall');
  const [open, setOpen] = useState(false);

  const model = data?.kinds?.[kind] ?? null;
  const series = useMemo<SurvivalSeries[]>(() => {
    if (!model) return [];
    const curves: Curve[] = split === 'overall'
      ? [model.overall]
      : (model[split] as Curve[]).slice(0, 5);
    return curves.map((c, i) => ({
      key: c.key ?? 'all',
      label: label(split, c.key),
      color: CURVE_COLORS[i % CURVE_COLORS.length],
      points: c.points,
      median: c.median,
    }));
  }, [model, split]);
  const rows = useMemo(() => sortRows(spellRows(data, kind), 'months', 'desc'), [data, kind]);

  if (!model) return null;
  const o = model.overall;

  return (
    <section className="section container" id="tulel">
      <h2 className="section__heading">{t('survival.heading')}</h2>
      <p className="section__explain">{tKind('survival.explain', kind, {
        spells: formatNumber(o.spells),
        refilled: formatNumber(o.refilled),
        open: formatNumber(o.stillOpen),
        from: model.months[0],
      })}</p>

      <div className="extra-stats">
        <span className="extra-stats__item">
          <strong>{o.median === null ? t('survival.notReached') : formatNumber(o.median)}</strong>
          {' '}{t('survival.median')}
        </span>
        <span className="extra-stats__item">
          <strong>{formatPercent(o.survival12 ?? 0, 0)}</strong> {t('survival.after12')}
        </span>
        <span className="extra-stats__item">
          <strong>{formatPercent(o.survival60 ?? 0, 0)}</strong> {t('survival.after60')}
        </span>
        <span className="extra-stats__item">
          <strong>{formatNumber(o.stillOpen)}</strong> {t('survival.stillOpen')}
        </span>
      </div>

      <div className="seg" role="group">
        {SPLITS.map((s) => (
          <button key={s} aria-pressed={split === s} onClick={() => setSplit(s)}>
            {t(`survival.split.${s}`)}
          </button>
        ))}
      </div>

      <SurvivalChart series={series} />

      <div className="eeszt-actions">
        <button className="data-btn data-btn--accent" onClick={() => setOpen(true)}>
          {t('survival.openTable', { n: formatNumber(rows.length) })}
        </button>
      </div>
      <p className="extra-note">{t('survival.note', {
        min: String(model.gapMonths.min),
        max: String(model.gapMonths.max),
        median: String(model.gapMonths.median),
        truncated: formatNumber(o.truncated),
      })}</p>

      <DataTableModal
        open={open}
        onClose={() => setOpen(false)}
        title={tKind('survival.tableTitle', kind)}
        subtitle={t('survival.tableSubtitle')}
        rows={rows}
        columns={SPELL_COLUMNS}
        filename={`praxisterkep-tulel-${kind}`}
        countUnit="rows"
      />
    </section>
  );
}
