// "Egységes NEAK lista": one row per contracted provider, with the official
// company name, tax number and registered seat resolved from the EESZT
// provider register, and what that provider runs across both branches.
import { useMemo, useState } from 'react';
import { t } from '../lib/i18n';
import { formatNumber, formatPercent } from '../lib/format';
import { sortRows } from '../lib/eesztTable';
import {
  PROVIDER_COLUMNS, biggestProviders, portfolioSpread, providerRows, useProviders,
} from '../lib/providers';
import { OPERATING_COLUMNS, operatingRows, useOperating } from '../lib/operating';
import { DataTableModal } from './DataTableModal';
import { renderExtraCell } from './EesztCells';

const SPREAD_COLOR: Record<string, string> = {
  '1': '#4fd6c2', '2': '#6ea8ff', '3-5': '#c98500', '6+': '#e05b8a',
};

export function ProviderSection({ part }: { part: number }) {
  const data = useProviders();
  const operating = useOperating();
  const [open, setOpen] = useState<'providers' | 'operating' | null>(null);

  const rows = useMemo(() => sortRows(providerRows(data), 'total', 'desc'), [data]);
  const spread = useMemo(() => portfolioSpread(data), [data]);
  const biggest = useMemo(() => biggestProviders(data, 5), [data]);
  const opRows = useMemo(
    () => sortRows(operatingRows(operating), 'settlement', 'asc'),
    [operating],
  );

  if (!data || rows.length === 0) return null;
  const st = data.stats;

  return (
    <>
      <h3 className="section__subheading" id="eeszt-providers">
        {t('providers.part', { n: part })}
      </h3>
      <h4 className="extra-block__title">{t('providers.levelProvider')}</h4>
      <p className="section__explain">{t('providers.explain')}</p>

      <div className="eeszt-coverage">
        <div className="eeszt-coverage__total">
          <strong>{formatNumber(st.providers)}</strong>
          <span>{t('providers.total')}</span>
        </div>
        {spread.map(({ key, n }) => (
          <div key={key} className="eeszt-coverage__row">
            <span className="eeszt-coverage__label">{t(`providers.spread.${key}`)}</span>
            <span className="eeszt-coverage__bar">
              <span style={{
                width: `${(n / st.providers) * 100}%`,
                background: SPREAD_COLOR[key],
              }} />
            </span>
            <span className="eeszt-coverage__val">
              {formatNumber(n)} <em>({formatPercent(n / st.providers)})</em>
            </span>
          </div>
        ))}
      </div>

      <div className="extra-stats">
        <span className="extra-stats__item">
          <strong>{formatNumber(st.identified)}</strong> {t('providers.identified')}
        </span>
        <span className="extra-stats__item">
          <strong>{formatNumber(st.byMatch.tax ?? 0)}</strong> {t('providers.byTax')}
        </span>
        <span className="extra-stats__item">
          <strong>{formatNumber(st.services)}</strong> {t('providers.services')}
        </span>
        <span className="extra-stats__item">
          <strong>{formatNumber(biggest[0]?.total ?? 0)}</strong> {t('providers.biggest')}
        </span>
      </div>

      <div className="eeszt-actions">
        <button className="data-btn data-btn--accent" onClick={() => setOpen('providers')}>
          {t('providers.openTable', { n: formatNumber(rows.length) })}
        </button>
      </div>
      <p className="extra-note">{t('providers.note', { asOf: data.asOf })}</p>

      {operating && opRows.length > 0 && (
        <>
          <h4 className="extra-block__title" id="eeszt-operating">
            {t('operating.level')}
          </h4>
          <p className="section__explain">{t('operating.explain')}</p>
          <div className="extra-stats">
            <span className="extra-stats__item">
              <strong>{formatNumber(operating.stats.praxes)}</strong> {t('operating.praxes')}
            </span>
            <span className="extra-stats__item">
              <strong>{formatNumber(operating.stats.fromCode)}</strong> {t('operating.fromCode')}
            </span>
            <span className="extra-stats__item">
              <strong>{formatNumber(operating.stats.fromCrosscheck)}</strong>
              {' '}{t('operating.fromCrosscheck')}
            </span>
            <span className="extra-stats__item">
              <strong>{formatNumber(operating.stats.multiSite)}</strong>
              {' '}{t('operating.multiSite')}
            </span>
            <span className="extra-stats__item">
              <strong>{formatNumber(operating.stats.noLicence)}</strong>
              {' '}{t('operating.noLicenceCount')}
            </span>
          </div>
          <div className="eeszt-actions">
            <button className="data-btn data-btn--accent" onClick={() => setOpen('operating')}>
              {t('operating.openTable', { n: formatNumber(opRows.length) })}
            </button>
          </div>
          <p className="extra-note">{t('operating.note')}</p>
          <DataTableModal
            open={open === 'operating'}
            onClose={() => setOpen((cur) => (cur === 'operating' ? null : cur))}
            title={t('operating.tableTitle')}
            subtitle={t('operating.tableSubtitle', { asOf: operating.asOf })}
            rows={opRows}
            columns={OPERATING_COLUMNS}
            filename="praxisterkep-mukodesi-szint"
            renderCell={renderExtraCell}
            countUnit="rows"
          />
        </>
      )}

      <DataTableModal
        open={open === 'providers'}
        onClose={() => setOpen((cur) => (cur === 'providers' ? null : cur))}
        title={t('providers.tableTitle')}
        subtitle={t('providers.tableSubtitle', { asOf: data.asOf })}
        rows={rows}
        columns={PROVIDER_COLUMNS}
        filename="praxisterkep-szolgaltatok"
        renderCell={renderExtraCell}
        countUnit="rows"
      />
    </>
  );
}
