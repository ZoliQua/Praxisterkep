// "Védőnői körzetek" — the third branch of primary care, shown on the landing
// page behind its own icon. There is no vacancy list for health visitors
// anywhere in the public data, so this section never speaks about vacancies:
// it shows how many services exist, who operates them, where their premises
// are, how many residents fall on one territorial service, and which
// settlements host no health-visitor office (which is not the same as saying
// no health visitor comes there — CLAUDE.md rule 4).
import { useMemo, useState } from 'react';
import { t } from '../lib/i18n';
import { formatNumber, formatPercent } from '../lib/format';
import { sortRows } from '../lib/eesztTable';
import {
  BRANCH_COLORS, COUNTY_COLUMNS, PROVIDER_COLUMNS, SERVICE_COLUMNS,
  SETTLEMENT_COLUMNS, countyRows, loadBands, providerRows, serviceRows,
  settlementRows, uncoveredPopulation, uncoveredSettlements, useVedono,
} from '../lib/vedono';
import { DataTableModal } from './DataTableModal';
import { EesztMap, type MapRow } from './EesztMap';
import { renderExtraCell } from './EesztCells';

function detailRows(row: MapRow): [string, string][] {
  return [
    [t('vedono.colBranch'), String(row.branch ?? '–')],
    [t('vedono.colProvider'), String(row.provider ?? '–')],
    [t('eeszt.colAddress'), `${row.postalCode ?? ''} ${row.settlement ?? ''}, ${row.address ?? ''}`],
    [t('vedono.colDistrict'), String(row.district || '–')],
    [t('eeszt.colLicence'), String(row.licenceId || '–')],
    [t('eeszt.colFin'), String(row.fin)],
  ];
}

type Modal = 'services' | 'counties' | 'providers' | 'uncovered' | 'covered' | null;

export function VedonoSection() {
  const data = useVedono();
  const [open, setOpen] = useState<Modal>(null);

  const rows = useMemo(() => serviceRows(data), [data]);
  const mapRows = useMemo(() => rows.filter((r) => r.lat !== null), [rows]);
  const counties = useMemo(() => sortRows(countyRows(data), 'territorial', 'desc'), [data]);
  const providers = useMemo(() => providerRows(data), [data]);
  const uncovered = useMemo(() => uncoveredSettlements(data), [data]);
  const covered = useMemo(
    () => (data?.settlements ?? []).filter((s) => s.services > 0), [data],
  );
  const bands = useMemo(() => loadBands(data), [data]);
  const categories = useMemo(() => (['territorial', 'school'] as const).map((b) => ({
    key: t(`vedono.branch.${b}`), label: t(`vedono.branch.${b}`), color: BRANCH_COLORS[b],
  })), []);

  if (!data) return null;
  const st = data.stats;
  const uncoveredPop = uncoveredPopulation(data);
  const coveredShare = st.settlementsTotal
    ? st.settlementsWithPremises / st.settlementsTotal : 0;

  return (
    <section className="section container" id="vedono">
      <div className="section__heading-row">
        <h2 className="section__heading">{t('vedono.heading')}</h2>
        <button className="icon-button" title={t('vedono.openCounties')}
          aria-label={t('vedono.openCounties')} onClick={() => setOpen('counties')}>
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <rect x="2.5" y="3.5" width="15" height="13" rx="1.5" fill="none"
              stroke="currentColor" strokeWidth="1.6" />
            <path d="M2.5 8h15M8 8v8.5M13 8v8.5" stroke="currentColor" strokeWidth="1.6" />
          </svg>
        </button>
      </div>
      <p className="section__explain">{t('vedono.explain', {
        services: formatNumber(st.services),
        territorial: formatNumber(st.territorial),
        school: formatNumber(st.school),
      })}</p>
      <p className="section__explain">{t('vedono.noVacancy')}</p>

      <div className="extra-stats">
        <span className="extra-stats__item">
          <strong>{formatNumber(st.territorial)}</strong> {t('vedono.statTerritorial')}
        </span>
        <span className="extra-stats__item">
          <strong>{formatNumber(st.school)}</strong> {t('vedono.statSchool')}
        </span>
        <span className="extra-stats__item">
          <strong>{formatNumber(st.residentsPerTerritorial)}</strong> {t('vedono.statPerService')}
        </span>
        <span className="extra-stats__item">
          <strong>{formatNumber(st.providers)}</strong> {t('vedono.statProviders')}
        </span>
      </div>

      <div className="eeszt-coverage">
        <div className="eeszt-coverage__total">
          <strong>{formatPercent(coveredShare)}</strong>
          <span>{t('vedono.coverageLead', {
            with: formatNumber(st.settlementsWithPremises),
            total: formatNumber(st.settlementsTotal),
          })}</span>
        </div>
        <div className="eeszt-coverage__row">
          <span className="eeszt-coverage__label">{t('vedono.withPremises')}</span>
          <span className="eeszt-coverage__bar">
            <span style={{ width: `${coveredShare * 100}%`, background: BRANCH_COLORS.territorial }} />
          </span>
          <span className="eeszt-coverage__val">
            <button className="info-drill" onClick={() => setOpen('covered')}>
              {formatNumber(covered.length)}
            </button>
          </span>
        </div>
        <div className="eeszt-coverage__row">
          <span className="eeszt-coverage__label">{t('vedono.withoutPremises')}</span>
          <span className="eeszt-coverage__bar">
            <span style={{ width: `${(1 - coveredShare) * 100}%`, background: '#ff7a59' }} />
          </span>
          <span className="eeszt-coverage__val">
            <button className="info-drill" onClick={() => setOpen('uncovered')}>
              {formatNumber(uncovered.length)}
            </button>
            {' '}<em>({formatNumber(uncoveredPop)} {t('access.people')})</em>
          </span>
        </div>
      </div>

      <EesztMap rows={mapRows as MapRow[]} categories={categories} detailRows={detailRows}
        searchLink={false} countKey="vedono.mapCount"
        exportName="praxisterkep-vedono" />

      <div className="extra-block">
        <h4 className="extra-block__title">{t('vedono.loadTitle')}</h4>
        <p className="section__explain">
          {t('vedono.loadExplain', { reference: formatNumber(data.referenceResidents) })}
        </p>
        <div className="eeszt-coverage">
          {bands.map((b) => (
            <div key={b.key} className="eeszt-coverage__row">
              <span className="eeszt-coverage__label">{b.label}</span>
              <span className="eeszt-coverage__bar">
                <span style={{ width: `${(b.n / 20) * 100}%`, background: b.color }} />
              </span>
              <span className="eeszt-coverage__val">{formatNumber(b.n)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="eeszt-actions">
        <button className="data-btn data-btn--accent" onClick={() => setOpen('services')}>
          {t('vedono.openTable', { n: formatNumber(rows.length) })}
        </button>
        <button className="data-btn" onClick={() => setOpen('counties')}>
          {t('vedono.openCounties')}
        </button>
        <button className="data-btn" onClick={() => setOpen('providers')}>
          {t('vedono.openProviders', { n: formatNumber(providers.length) })}
        </button>
      </div>
      <p className="extra-note">
        {t('vedono.note', {
          asOf: data.asOf,
          licence: formatNumber(st.withLicence),
          missing: formatNumber(st.withoutLicence),
          geocoded: formatNumber(st.geocoded),
        })}
      </p>

      <DataTableModal
        open={open === 'services'}
        onClose={() => setOpen((cur) => (cur === 'services' ? null : cur))}
        title={t('vedono.tableTitle')}
        subtitle={t('vedono.tableSubtitle')}
        rows={rows}
        columns={SERVICE_COLUMNS}
        filename="praxisterkep-vedono"
        renderCell={renderExtraCell}
        countUnit="rows"
        above={{
          label: t('eeszt.mapToggle'),
          render: (filtered) => (
            <EesztMap rows={filtered.filter((r) => r.lat !== null) as MapRow[]} height={320}
              countyFilter={false} fitToRows searchLink={false} categories={categories}
              detailRows={detailRows} countKey="vedono.mapCount"
              exportName="praxisterkep-vedono" />
          ),
        }}
      />
      <DataTableModal
        open={open === 'counties'}
        onClose={() => setOpen((cur) => (cur === 'counties' ? null : cur))}
        title={t('vedono.countyTitle')}
        subtitle={t('vedono.countySubtitle')}
        rows={counties}
        columns={COUNTY_COLUMNS}
        filename="praxisterkep-vedono-megyek"
        countUnit="rows"
      />
      <DataTableModal
        open={open === 'providers'}
        onClose={() => setOpen((cur) => (cur === 'providers' ? null : cur))}
        title={t('vedono.providerTitle')}
        subtitle={t('vedono.providerSubtitle')}
        rows={providers}
        columns={PROVIDER_COLUMNS}
        filename="praxisterkep-vedono-fenntartok"
        countUnit="rows"
      />
      {(open === 'uncovered' || open === 'covered') && (
        <DataTableModal
          open
          onClose={() => setOpen(null)}
          title={t(open === 'uncovered' ? 'vedono.uncoveredTitle' : 'vedono.coveredTitle')}
          subtitle={t(open === 'uncovered' ? 'vedono.uncoveredSubtitle' : 'vedono.coveredSubtitle')}
          rows={settlementRows(open === 'uncovered' ? uncovered : covered)}
          columns={SETTLEMENT_COLUMNS}
          filename={`praxisterkep-vedono-${open === 'uncovered' ? 'telephely-nelkul' : 'telephellyel'}`}
          countUnit="rows"
        />
      )}
    </section>
  );
}
