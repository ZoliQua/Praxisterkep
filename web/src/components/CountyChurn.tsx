// "Mennyire cserélődnek az orvosok?" — physician turnover, county by county.
//
// A district held by the same doctor for seven years and one that has had
// three in four are both "filled" on the map. This section is the difference,
// and it exists because the archive can see it: every monthly snapshot names
// the contracted physician, so a change of name between two of them is a
// change of doctor.
import { useMemo, useState } from 'react';
import { t, tKind } from '../lib/i18n';
import { formatDecimal, formatNumber, formatPercent } from '../lib/format';
import {
  CHURN_COLUMNS, churnRows, churnTableRows, useFluctuation,
} from '../lib/fluctuation';
import { DataTableModal } from './DataTableModal';
import type { PraxisKind } from '../types';

export function CountyChurn({ county }: { county: string | null }) {
  const data = useFluctuation();
  const [kind, setKind] = useState<PraxisKind>('gp');
  const [open, setOpen] = useState(false);
  const rows = useMemo(() => churnRows(data, kind), [data, kind]);
  if (!data) return null;

  const branch = data.kinds[kind];
  const mine = rows.find((r) => r.county === county) ?? null;
  const worst = [...rows].sort((a, b) => (b.recentRate ?? 0) - (a.recentRate ?? 0))[0];
  const max = Math.max(...rows.map((r) => r.recentRate ?? 0), 1);

  return (
    <section className="section container" id="fluktuacio">
      <h2 className="section__heading">{t('churn.heading')}</h2>
      <p className="section__explain">{t('churn.explain', {
        months: String(data.recentMonths), from: branch.from,
        snapshots: String(branch.snapshots),
      })}</p>

      <div className="topnav__kind churn-kind" role="group">
        {(['gp', 'dental'] as const).map((k) => (
          <button key={k} aria-pressed={kind === k} onClick={() => setKind(k)}>
            {t(`kinds.${k}.label`)}
          </button>
        ))}
      </div>

      <div className="county-stats">
        <div className="stat">
          <div className="stat__value">{formatNumber(branch.recentChanges)}</div>
          <div className="stat__label">{tKind('churn.changes', kind, {
            months: String(data.recentMonths),
          })}</div>
          <div className="stat__context">{t('churn.ofDistricts', {
            share: formatPercent(branch.recentChanges / branch.districts),
            n: formatNumber(branch.districts),
          })}</div>
        </div>
        {mine && (
          <div className="stat">
            <div className="stat__value">{formatDecimal(String(mine.recentRate ?? 0))}%</div>
            <div className="stat__label">{t('churn.countyRate', { county: mine.county })}</div>
            <div className="stat__context">{t('churn.countyDetail', {
              changes: formatNumber(mine.recentChanges),
              districts: formatNumber(mine.districts),
              years: formatDecimal(((mine.medianTenureMonths ?? 0) / 12).toFixed(1)),
            })}</div>
          </div>
        )}
        {worst && (
          <div className="stat">
            <div className="stat__value">{worst.county}</div>
            <div className="stat__label">{t('churn.worst')}</div>
            <div className="stat__context">{t('churn.countyDetail', {
              changes: formatNumber(worst.recentChanges),
              districts: formatNumber(worst.districts),
              years: formatDecimal(((worst.medianTenureMonths ?? 0) / 12).toFixed(1)),
            })}</div>
          </div>
        )}
      </div>

      <div className="churn-bars">
        {[...rows].sort((a, b) => (b.recentRate ?? 0) - (a.recentRate ?? 0)).map((r) => (
          <div key={r.county} className={`churn-bar${r.county === county ? ' is-on' : ''}`}>
            <span className="churn-bar__name">{r.county}</span>
            <span className="churn-bar__track">
              <span className="churn-bar__fill"
                style={{ width: `${((r.recentRate ?? 0) / max) * 100}%` }} />
            </span>
            <span className="churn-bar__value">
              {formatDecimal(String(r.recentRate ?? 0))}%
              <span className="churn-bar__abs"> ({formatNumber(r.recentChanges)}/{
                formatNumber(r.districts)})</span>
            </span>
          </div>
        ))}
      </div>

      <div className="eeszt-actions">
        <button className="data-btn data-btn--accent" onClick={() => setOpen(true)}>
          {t('churn.openTable')}
        </button>
      </div>
      <p className="extra-note">{t('churn.caveat')}</p>

      <DataTableModal open={open} onClose={() => setOpen(false)}
        title={t('churn.tableTitle')} subtitle={t('churn.explainShort')}
        rows={churnTableRows(data, kind)} columns={CHURN_COLUMNS} countUnit="rows"
        filename={`praxisterkep-fluktuacio-${kind}`} />
    </section>
  );
}
