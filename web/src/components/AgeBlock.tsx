// The age composition behind every rate on the site: who actually lives in
// the counties the vacancy figures talk about. A district with a thousand
// residents means something different where a third of them are over 65.
// Source: KSH 2022 census (CC BY 4.0), shares carried onto the current
// resident population — the derivation is stated, not hidden.
import { useMemo, useState } from 'react';
import { t } from '../lib/i18n';
import { formatNumber, formatPercent } from '../lib/format';
import { AGE_COUNTY_COLUMNS, ageCountyRows, useAge } from '../lib/age';
import { DataTableModal } from './DataTableModal';

export function AgeBlock() {
  const data = useAge();
  const [open, setOpen] = useState(false);
  const counties = useMemo(() => ageCountyRows(data), [data]);

  if (!data) return null;
  const country = data.country;
  const oldest = [...data.counties].sort((a, b) => (b.oldShare ?? 0) - (a.oldShare ?? 0))[0];
  const youngest = [...data.counties].sort((a, b) => (b.youngShare ?? 0) - (a.youngShare ?? 0))[0];

  return (
    <div className="extra-block" id="korosszetetel">
      <h4 className="extra-block__title">{t('age.title')}</h4>
      <p className="section__explain">{t('age.explain', {
        year: String(data.censusYear),
        young: formatPercent(country.youngShare ?? 0),
        old: formatPercent(country.oldShare ?? 0),
      })}</p>

      <div className="extra-stats">
        <span className="extra-stats__item">
          <strong>{formatNumber(country.oldNow ?? 0)}</strong> {t('age.statOld')}
        </span>
        <span className="extra-stats__item">
          <strong>{formatNumber(country.youngNow ?? 0)}</strong> {t('age.statYoung')}
        </span>
        <span className="extra-stats__item">
          <strong>{oldest?.name}</strong> {t('age.statOldest', {
            share: formatPercent(oldest?.oldShare ?? 0),
          })}
        </span>
        <span className="extra-stats__item">
          <strong>{youngest?.name}</strong> {t('age.statYoungest', {
            share: formatPercent(youngest?.youngShare ?? 0),
          })}
        </span>
      </div>

      <div className="eeszt-actions">
        <button className="data-btn" onClick={() => setOpen(true)}>
          {t('age.openTable')}
        </button>
      </div>
      <p className="extra-note">{t('age.note', {
        year: String(data.censusYear),
        population: String(data.populationYear),
        suppressed: formatNumber(
          data.settlements.filter((s) => s.suppressed).length),
      })}</p>

      <DataTableModal
        open={open}
        onClose={() => setOpen(false)}
        title={t('age.tableTitle')}
        subtitle={t('age.tableSubtitle', { year: String(data.censusYear) })}
        rows={counties}
        columns={AGE_COUNTY_COLUMNS}
        filename="praxisterkep-korosszetetel-megyek"
        countUnit="rows"
      />
    </div>
  );
}
