// "Szakellátás" (szakellato.html): the contracted inpatient and outpatient
// institutions NEAK publishes beside the district registries. Primary care
// ends where these begin — nothing on this page enters a vacancy rate — but
// the specialist network is the context every district sits in: what exists,
// where it is, and how thinly some professions are spread over the country.
import { useMemo, useState } from 'react';
import { t } from '../lib/i18n';
import { formatNumber, formatPercent } from '../lib/format';
import { sortRows } from '../lib/eesztTable';
import {
  CARE_COLORS, COUNTY_COLUMNS, COVERAGE_COLUMNS, INSTITUTION_COLUMNS,
  PROFESSION_COLUMNS, ROW_COLUMNS, SITE_COLUMNS, type Care, countyRows,
  coverageRows, institutionRows, professionCoverage, professionRows,
  rareProfessions, rowRows, siteRows, useSpecialist,
} from '../lib/specialist';
import { DataTableModal } from './DataTableModal';
import { EesztMap, type MapRow } from './EesztMap';
import { PageNav } from './PageNav';
import { renderExtraCell } from './EesztCells';

const LINKS = [
  ['elemzo.html', 'nav.analysis'],
  ['eeszt.html', 'nav.eeszt'],
] as const;

function detailRows(row: MapRow): [string, string][] {
  return [
    [t('specialist.colCare'), String(row.care ?? '–')],
    [t('specialist.colInstitution'), String(row.institution ?? '–')],
    [t('eeszt.colAddress'), `${row.postalCode ?? ''} ${row.settlement ?? ''}, ${row.address ?? ''}`],
    [t('specialist.colUnits'), String(row.units ?? '–')],
    [t('specialist.colProfessions'), String(row.professions ?? '–')],
    [t('operating.colNeakCode'), String(row.neakCode ?? '–')],
  ];
}

type Modal = 'sites' | 'rows' | 'counties' | 'professions' | 'institutions'
  | 'coverage' | 'rare' | null;

export function SpecialistPage() {
  const data = useSpecialist();
  const [care, setCare] = useState<Care | 'all'>('all');
  const [open, setOpen] = useState<Modal>(null);

  const sites = useMemo(() => siteRows(data, care), [data, care]);
  const mapSites = useMemo(() => sites.filter((s) => s.lat !== null), [sites]);
  const rows = useMemo(() => rowRows(data, care), [data, care]);
  const counties = useMemo(
    () => sortRows(countyRows(data), 'outpatientRooms', 'desc'), [data],
  );
  const professions = useMemo(
    () => sortRows(professionRows(data, care), 'units', 'desc'), [data, care],
  );
  const institutions = useMemo(
    () => sortRows(institutionRows(data, care), 'units', 'desc'), [data, care],
  );
  const coverageCare: Care = care === 'inpatient' ? 'inpatient' : 'outpatient';
  const coverage = useMemo(
    () => professionCoverage(data, coverageCare), [data, coverageCare],
  );
  const rare = useMemo(() => rareProfessions(data, coverageCare), [data, coverageCare]);
  const categories = useMemo(() => (['inpatient', 'outpatient'] as Care[])
    .filter((c) => care === 'all' || care === c)
    .map((c) => ({
      key: t(`specialist.care.${c}`), label: t(`specialist.care.${c}`), color: CARE_COLORS[c],
    })), [care]);

  if (!data) return (<><PageNav links={LINKS} /><div className="loading">…</div></>);
  const inp = data.stats.inpatient;
  const outp = data.stats.outpatient;
  const worst = coverage[coverage.length - 1];
  const best = coverage[0];

  return (
    <>
      <PageNav links={LINKS} />
      <header className="section container">
        <h1 className="section__heading">{t('specialist.heading')}</h1>
        <p className="section__lead">{t('specialist.lead')}</p>
        <p className="section__explain">{t('specialist.explain')}</p>
      </header>

      <section className="section container">
        <div className="extra-stats">
          <span className="extra-stats__item">
            <strong>{formatNumber(inp.institutions)}</strong> {t('specialist.statInpInst')}
          </span>
          <span className="extra-stats__item">
            <strong>{formatNumber(inp.units)}</strong> {t('specialist.statInpDept')}
          </span>
          <span className="extra-stats__item">
            <strong>{formatNumber(outp.institutions)}</strong> {t('specialist.statOutInst')}
          </span>
          <span className="extra-stats__item">
            <strong>{formatNumber(outp.units)}</strong> {t('specialist.statOutRoom')}
          </span>
          <span className="extra-stats__item">
            <strong>{formatNumber(inp.professions + outp.professions)}</strong>
            {' '}{t('specialist.statProfessions')}
          </span>
          <span className="extra-stats__item">
            <strong>{formatNumber(inp.sites + outp.sites)}</strong> {t('specialist.statSites')}
          </span>
        </div>

        <div className="seg" role="group">
          {(['all', 'inpatient', 'outpatient'] as const).map((c) => (
            <button key={c} aria-pressed={care === c} onClick={() => setCare(c)}>
              {t(c === 'all' ? 'specialist.careAll' : `specialist.care.${c}`)}
            </button>
          ))}
        </div>

        <EesztMap rows={mapSites as MapRow[]} categories={categories}
          detailRows={detailRows} searchLink={false} countKey="specialist.mapCount"
          exportName={`praxisterkep-szakellatas-${care}`} />

        <div className="eeszt-actions">
          <button className="data-btn data-btn--accent" onClick={() => setOpen('sites')}>
            {t('specialist.openSites', { n: formatNumber(sites.length) })}
          </button>
          <button className="data-btn" onClick={() => setOpen('rows')}>
            {t('specialist.openRows', { n: formatNumber(rows.length) })}
          </button>
          <button className="data-btn" onClick={() => setOpen('institutions')}>
            {t('specialist.openInstitutions', { n: formatNumber(institutions.length) })}
          </button>
          <button className="data-btn" onClick={() => setOpen('counties')}>
            {t('specialist.openCounties')}
          </button>
        </div>
      </section>

      <section className="section container">
        <h2 className="section__heading">{t('specialist.professionsTitle')}</h2>
        <p className="section__explain">{t('specialist.professionsExplain')}</p>

        {best && worst && (
          <p className="access-county">
            {t('specialist.coverageLine', {
              care: t(`specialist.care.${coverageCare}`),
              total: formatNumber(best.total),
              best: best.county,
              bestN: formatNumber(best.present),
              worst: worst.county,
              worstN: formatNumber(worst.present),
            })}
          </p>
        )}

        <div className="eeszt-coverage">
          {coverage.slice(0, 20).map((c) => (
            <div key={c.county} className="eeszt-coverage__row">
              <span className="eeszt-coverage__label">{c.county}</span>
              <span className="eeszt-coverage__bar">
                <span style={{ width: `${c.share * 100}%`, background: CARE_COLORS[coverageCare] }} />
              </span>
              <span className="eeszt-coverage__val">
                {formatNumber(c.present)} <em>({formatPercent(c.share)})</em>
              </span>
            </div>
          ))}
        </div>

        <div className="eeszt-actions">
          <button className="data-btn data-btn--accent" onClick={() => setOpen('professions')}>
            {t('specialist.openProfessions', { n: formatNumber(professions.length) })}
          </button>
          <button className="data-btn" onClick={() => setOpen('rare')}>
            {t('specialist.openRare', { n: formatNumber(rare.length) })}
          </button>
          <button className="data-btn" onClick={() => setOpen('coverage')}>
            {t('specialist.openCoverage')}
          </button>
        </div>
        <p className="extra-note">{t('specialist.note', {
          month: data.dataMonth,
          geocoded: formatNumber(inp.geocoded + outp.geocoded),
          rows: formatNumber(inp.rows + outp.rows),
        })}</p>
        <p className="extra-note">{t('specialist.pdfNote')}</p>
      </section>

      <DataTableModal
        open={open === 'sites'}
        onClose={() => setOpen((cur) => (cur === 'sites' ? null : cur))}
        title={t('specialist.siteTitle')}
        subtitle={t('specialist.siteSubtitle')}
        rows={sites}
        columns={SITE_COLUMNS}
        filename={`praxisterkep-szakellatas-telephelyek-${care}`}
        renderCell={renderExtraCell}
        countUnit="rows"
        above={{
          label: t('eeszt.mapToggle'),
          render: (filtered) => (
            <EesztMap rows={filtered.filter((r) => r.lat !== null) as MapRow[]} height={320}
              countyFilter={false} fitToRows searchLink={false} categories={categories}
              detailRows={detailRows} countKey="specialist.mapCount"
              exportName={`praxisterkep-szakellatas-${care}`} />
          ),
        }}
      />
      <DataTableModal
        open={open === 'rows'}
        onClose={() => setOpen((cur) => (cur === 'rows' ? null : cur))}
        title={t('specialist.rowTitle')}
        subtitle={t('specialist.rowSubtitle')}
        rows={rows}
        columns={ROW_COLUMNS}
        filename={`praxisterkep-szakellatas-${care}`}
        countUnit="rows"
      />
      <DataTableModal
        open={open === 'institutions'}
        onClose={() => setOpen((cur) => (cur === 'institutions' ? null : cur))}
        title={t('specialist.institutionTitle')}
        subtitle={t('specialist.institutionSubtitle')}
        rows={institutions}
        columns={INSTITUTION_COLUMNS}
        filename={`praxisterkep-szakellatas-intezmenyek-${care}`}
        countUnit="rows"
      />
      <DataTableModal
        open={open === 'counties'}
        onClose={() => setOpen((cur) => (cur === 'counties' ? null : cur))}
        title={t('specialist.countyTitle')}
        subtitle={t('specialist.countySubtitle')}
        rows={counties}
        columns={COUNTY_COLUMNS}
        filename="praxisterkep-szakellatas-megyek"
        countUnit="rows"
      />
      <DataTableModal
        open={open === 'professions'}
        onClose={() => setOpen((cur) => (cur === 'professions' ? null : cur))}
        title={t('specialist.professionTitle')}
        subtitle={t('specialist.professionSubtitle')}
        rows={professions}
        columns={PROFESSION_COLUMNS}
        filename={`praxisterkep-szakellatas-szakmak-${care}`}
        countUnit="rows"
      />
      <DataTableModal
        open={open === 'rare'}
        onClose={() => setOpen((cur) => (cur === 'rare' ? null : cur))}
        title={t('specialist.rareTitle', { care: t(`specialist.care.${coverageCare}`) })}
        subtitle={t('specialist.rareSubtitle')}
        rows={rare.map((p) => ({
          profession: p.profession, code: p.code, units: p.units,
          institutions: p.institutions, counties: p.counties,
          settlements: p.settlements, countyList: p.countyList.join(', '),
          care: t(`specialist.care.${p.care}`),
        }))}
        columns={PROFESSION_COLUMNS.map((c) => (
          c.key === 'countyList' ? { ...c, visible: true } : c
        ))}
        filename={`praxisterkep-szakellatas-ritka-${coverageCare}`}
        countUnit="rows"
      />
      <DataTableModal
        open={open === 'coverage'}
        onClose={() => setOpen((cur) => (cur === 'coverage' ? null : cur))}
        title={t('specialist.coverageTitle', { care: t(`specialist.care.${coverageCare}`) })}
        subtitle={t('specialist.coverageSubtitle')}
        rows={coverageRows(coverage)}
        columns={COVERAGE_COLUMNS}
        filename={`praxisterkep-szakellatas-lefedettseg-${coverageCare}`}
        countUnit="rows"
      />
    </>
  );
}
