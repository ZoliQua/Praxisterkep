// "Hogyan illesztettük?" — the full, traceable account of how the EESZT
// supplement is built: sources (with live portal links and archive files),
// download, then, per data set (districts / on-call + university primary care
// / specialist care), the code chain step by step, every check, the name
// policy, geocoding, the live results with drill-down tables, a worked example
// with deep links, and how anyone can re-verify it.
import { useEffect, useMemo, useRef, useState } from 'react';
import { t } from '../lib/i18n';
import { formatNumber, formatPercent } from '../lib/format';
import { eesztLink, eesztPraxis, type EesztRaw } from '../lib/eeszt';
import { buildReasonRows } from '../lib/eesztTable';
import {
  EXTRA_REASONS, extraReasonRows, reasonCount, useDentalExtra,
  type DentalExtraRaw, type ExtraGroup, type ExtraService,
} from '../lib/dentalExtra';
import {
  CANDIDATE_COLUMNS, candidateRows, useCrosscheck, verdictBreakdown,
  type CrosscheckRaw,
} from '../lib/crosscheck';
import { useAppStore } from '../store/useAppStore';
import { DataTableModal } from './DataTableModal';
import { makeCellRenderer, renderExtraCell } from './EesztCells';
import { NeakDetailModal } from './NeakDetailModal';

const REPO = 'https://github.com/ZoliQua/OEP-Alapellatas/blob/main';
const EXAMPLE_FIN = '020066099'; // Sásd, dental — also a vacant district

type Tab = 'districts' | 'primary' | 'specialist' | 'crosscheck';
const TABS: Tab[] = ['districts', 'primary', 'specialist', 'crosscheck'];
const TAB_GROUPS: Record<'primary' | 'specialist', ExtraGroup[]> = {
  primary: ['oncall', 'university'],
  specialist: ['specialist'],
};

type Drill =
  | { scope: 'districts'; reason: string; kind: 'dental' | 'gp' }
  | { scope: 'services'; reason: string; group: ExtraGroup }
  | { scope: 'crosscheck'; reason: string; family: 'dental' | 'gp' };

function Ext({ href, children }: { href: string; children: React.ReactNode }) {
  return <a href={href} target="_blank" rel="noopener">{children}</a>;
}

/** the number in a results table, clickable when it can be listed row by row */
function StatCell({ n, total, onOpen }: {
  n: number; total: number; onOpen?: () => void;
}) {
  const text = `${formatNumber(n)} (${total ? formatPercent(n / total) : '–'})`;
  return (
    <td className="is-num">
      {onOpen && n > 0
        ? <button className="info-drill" onClick={onOpen}
          title={t('eesztInfo.drillOpen')}>{text}</button>
        : text}
    </td>
  );
}

/* ---------------- the districts (unchanged chain) ---------------- */

function DistrictsTab({ data, onDrill }: {
  data: EesztRaw; onDrill: (d: Drill) => void;
}) {
  const kinds: ('dental' | 'gp')[] = ['dental', 'gp'];
  const ex = eesztPraxis(data, EXAMPLE_FIN);
  const exLic = ex?.licence;
  const exTrace = ex?.trace;
  // the four reasons can be opened row by row
  const DRILLABLE = new Set(['noUnitLicence', 'ambiguous', 'noFin', 'otherProfession']);

  return (
    <>
      <h4>4. {t('eesztInfo.h4')}</h4>
      <ol className="info-steps">
        {['s1', 's2', 's3', 's4', 's5', 's6'].map((k) => <li key={k}>{t(`eesztInfo.${k}`)}</li>)}
      </ol>
      <p>{t('eesztInfo.p4')}{' '}
        <Ext href={`${REPO}/etl/build_eeszt.py`}><code>etl/build_eeszt.py</code></Ext>
      </p>

      <h4>5. {t('eesztInfo.h5')}</h4>
      <ul className="info-list">
        {['c1', 'c2', 'c3', 'c4', 'c5'].map((k) => (
          <li key={k}><strong>{t(`eesztInfo.${k}t`)}</strong> — {t(`eesztInfo.${k}`)}</li>
        ))}
      </ul>

      <h4>6. {t('eesztInfo.h6')}</h4>
      <ul className="info-list">
        <li>{t('eesztInfo.n1')}</li>
        <li>{t('eesztInfo.n2', {
          n: formatNumber(kinds.reduce((a, k) => a + (data.stats[k]?.nameHidden ?? 0), 0)),
        })}</li>
        <li>{t('eesztInfo.n3')}</li>
        <li>{t('eesztInfo.n4')}</li>
      </ul>

      <h4>7. {t('eesztInfo.h7')}</h4>
      <p>{t('eesztInfo.p7')}</p>

      <h4>8. {t('eesztInfo.h8')}</h4>
      <p>{t('eesztInfo.p8')}{' '}
        <Ext href={`${REPO}/etl/geocode_eeszt.py`}><code>etl/geocode_eeszt.py</code></Ext>
      </p>

      <h4>9. {t('eesztInfo.h9')}</h4>
      <table className="info-table">
        <thead>
          <tr>
            <th />
            <th className="is-num">{t('kinds.dental.label')}</th>
            <th className="is-num">{t('kinds.gp.label')}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{t('eesztInfo.rTotal')}</td>
            {kinds.map((k) => (
              <td key={k} className="is-num">{formatNumber(data.stats[k]?.total ?? 0)}</td>
            ))}
          </tr>
          {([
            ['fin', 'eeszt.covFin'],
            ['licence', 'eeszt.covLicence'],
            ['settlementMatch', 'eeszt.covSettlement'],
            ['providerMatch', 'eeszt.covProvider'],
            ['noUnitLicence', 'eeszt.reason.noUnitLicence'],
            ['ambiguous', 'eeszt.reason.ambiguous'],
            ['noFin', 'eeszt.reason.noFin'],
            ['otherProfession', 'eeszt.reason.otherProfession'],
          ] as const).map(([key, label]) => (
            <tr key={key}>
              <td>{t(label)}</td>
              {kinds.map((k) => (
                <StatCell key={k} n={data.stats[k]?.[key] ?? 0} total={data.stats[k]?.total ?? 0}
                  onOpen={DRILLABLE.has(key)
                    ? () => onDrill({ scope: 'districts', reason: key, kind: k })
                    : undefined} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p>{t('eesztInfo.p9')} {t('eesztInfo.p9b')}</p>

      {exLic && exTrace && (
        <>
          <h4>10. {t('eesztInfo.h10')}</h4>
          <p>{t('eesztInfo.p10')}</p>
          <ol className="info-steps">
            <li>
              {t('eesztInfo.e1', { fin: EXAMPLE_FIN })}{' '}
              <Ext href={eesztLink('finszolg', 'FINKOD', EXAMPLE_FIN)}>{t('eesztInfo.open')}</Ext>
            </li>
            <li>
              {t('eesztInfo.e2', { unit: exTrace.units.join(', ') })}{' '}
              <Ext href={eesztLink('engedely', 'SZERVEZETI_EGYSEG_KOD', exTrace.units[0])}>
                {t('eesztInfo.open')}</Ext>
            </li>
            <li>
              {t('eesztInfo.e3', {
                licence: exTrace.licenceId,
                address: `${exLic.postalCode} ${exLic.settlement}, ${exLic.address}`,
                profession: exLic.profession,
              })}{' '}
              <Ext href={eesztLink('engedely', 'ENGEDELY_AZONOSITO', exTrace.licenceId)}>
                {t('eesztInfo.open')}</Ext>
            </li>
            <li>{t('eesztInfo.e4', {
              settlement: exLic.settlementMatch ? t('eeszt.yes') : t('eeszt.no'),
              provider: exLic.providerMatch ? t('eeszt.yes') : t('eeszt.no'),
            })}</li>
            <li>{t('eesztInfo.e5')}</li>
          </ol>
        </>
      )}

      <h4>11. {t('eesztInfo.h11')}</h4>
      <ul className="info-list">
        {['v1', 'v2', 'v3', 'v4'].map((k) => <li key={k}>{t(`eesztInfo.${k}`)}</li>)}
      </ul>

      <h4>12. {t('eesztInfo.h12')}</h4>
      <ul className="info-list">
        {['l1', 'l2', 'l3', 'l4'].map((k) => <li key={k}>{t(`eesztInfo.${k}`)}</li>)}
      </ul>
    </>
  );
}

/* ---------------- the services that are not districts ---------------- */

function example(extra: DentalExtraRaw, groups: ExtraGroup[]): ExtraService | undefined {
  return extra.services.find((s) => groups.includes(s.group) && s.licence && s.trace?.licenceId);
}

function ServicesTab({ tab, extra, onDrill }: {
  tab: 'primary' | 'specialist'; extra: DentalExtraRaw | null;
  onDrill: (d: Drill) => void;
}) {
  if (!extra) return <p>{t('eesztInfo.svc.missing')}</p>;
  const groups = TAB_GROUPS[tab];
  const what = t(`eesztInfo.svc.what.${tab}`);
  const professions = t(`eesztInfo.svc.professions.${tab}`);
  const ex = example(extra, groups);

  return (
    <>
      <h4>4. {t('eesztInfo.h4')}</h4>
      <ol className="info-steps">
        {['s1', 's2', 's3', 's4', 's5', 's6'].map((k) => (
          <li key={k}>{t(`eesztInfo.svc.${k}`, { what, professions })}</li>
        ))}
      </ol>
      <p>{t('eesztInfo.svc.p4')}{' '}
        <Ext href={`${REPO}/etl/build_dental_extra.py`}>
          <code>etl/build_dental_extra.py</code></Ext>
      </p>

      <h4>5. {t('eesztInfo.h5')}</h4>
      <ul className="info-list">
        {['c1', 'c2', 'c3', 'c4'].map((k) => (
          <li key={k}>
            <strong>{t(`eesztInfo.svc.${k}t`)}</strong> — {t(`eesztInfo.svc.${k}`, { professions })}
          </li>
        ))}
      </ul>

      <h4>6. {t('eesztInfo.h6')}</h4>
      <ul className="info-list">
        {['n1', 'n2', 'n3'].map((k) => (
          <li key={k}>{t(`eesztInfo.svc.${k}`, {
            n: formatNumber(groups.reduce((a, g) => a + reasonCount(extra, g, 'unnamed'), 0)),
          })}</li>
        ))}
      </ul>

      <h4>7. {t('eesztInfo.svc.h7')}</h4>
      <p>{t('eesztInfo.svc.p7')}</p>

      <h4>8. {t('eesztInfo.h8')}</h4>
      <p>{t('eesztInfo.svc.p8')}{' '}
        <Ext href={`${REPO}/etl/geocode_eeszt.py`}><code>etl/geocode_eeszt.py</code></Ext>
      </p>

      <h4>9. {t('eesztInfo.h9')}</h4>
      <table className="info-table">
        <thead>
          <tr>
            <th />
            {groups.map((g) => (
              <th key={g} className="is-num">{t(`extra.${g}Title`)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{t('eesztInfo.svc.rTotal')}</td>
            {groups.map((g) => (
              <td key={g} className="is-num">{formatNumber(reasonCount(extra, g, 'services'))}</td>
            ))}
          </tr>
          <tr>
            <td>{t('eesztInfo.svc.rRows')}</td>
            {groups.map((g) => (
              <td key={g} className="is-num">{formatNumber(reasonCount(extra, g, 'rows'))}</td>
            ))}
          </tr>
          {([
            ['fin', 'eesztInfo.svc.rFin'],
            ['licence', 'eesztInfo.svc.rLicence'],
            ['settlementMatch', 'eesztInfo.svc.rSettlement'],
            ['providerMatch', 'eesztInfo.svc.rProvider'],
            ['geo', 'eesztInfo.svc.rGeo'],
          ] as const).map(([key, label]) => (
            <tr key={key}>
              <td>{t(label)}</td>
              {groups.map((g) => (
                <StatCell key={g} n={reasonCount(extra, g, key)}
                  total={reasonCount(extra, g, 'services')} />
              ))}
            </tr>
          ))}
          {EXTRA_REASONS.map((reason) => (
            groups.some((g) => reasonCount(extra, g, reason) > 0) && (
              <tr key={reason}>
                <td>{t(`eeszt.reason.${reason}`)}</td>
                {groups.map((g) => (
                  <StatCell key={g} n={reasonCount(extra, g, reason)}
                    total={reasonCount(extra, g, 'services')}
                    onOpen={() => onDrill({ scope: 'services', reason, group: g })} />
                ))}
              </tr>
            )
          ))}
        </tbody>
      </table>
      <p>{t('eesztInfo.svc.p9')}</p>

      {ex?.licence && ex.trace && (
        <>
          <h4>10. {t('eesztInfo.svc.h10')}</h4>
          <p>{t('eesztInfo.svc.p10', { type: ex.unitType })}</p>
          <ol className="info-steps">
            <li>
              {t('eesztInfo.svc.e1', { code: ex.id, type: ex.unitType, settlement: ex.settlement })}{' '}
              <Ext href={eesztLink('finszolg', 'FINKOD', ex.id)}>{t('eesztInfo.open')}</Ext>
            </li>
            <li>
              {t('eesztInfo.svc.e2', { unit: ex.trace.units })}{' '}
              <Ext href={eesztLink('engedely', 'SZERVEZETI_EGYSEG_KOD', ex.trace.units.split(',')[0])}>
                {t('eesztInfo.open')}</Ext>
            </li>
            <li>
              {t('eesztInfo.svc.e3', {
                licence: ex.trace.licenceId,
                profession: extra.professions[ex.licence.profession] ?? ex.licence.profession,
                address: `${ex.licence.postalCode} ${ex.licence.settlement}, ${ex.licence.address}`,
              })}{' '}
              <Ext href={eesztLink('engedely', 'ENGEDELY_AZONOSITO', ex.trace.licenceId)}>
                {t('eesztInfo.open')}</Ext>
            </li>
            <li>{t('eesztInfo.svc.e4', {
              settlementMatch: ex.licence.settlementMatch ? t('eeszt.yes') : t('eeszt.no'),
              providerMatch: ex.licence.providerMatch ? t('eeszt.yes') : t('eeszt.no'),
            })}</li>
          </ol>
        </>
      )}

      <h4>11. {t('eesztInfo.h11')}</h4>
      <ul className="info-list">
        {['v1', 'v2', 'v3'].map((k) => <li key={k}>{t(`eesztInfo.svc.${k}`)}</li>)}
      </ul>

      <h4>12. {t('eesztInfo.h12')}</h4>
      <ul className="info-list">
        {['l1', 'l2', 'l3'].map((k) => <li key={k}>{t(`eesztInfo.svc.${k}`, { what })}</li>)}
      </ul>
    </>
  );
}

/* ---------------- cross-check ---------------- */

function CrosscheckTab({ data, onDrill }: {
  data: CrosscheckRaw | null; onDrill: (d: Drill) => void;
}) {
  if (!data) return <p>{t('eesztInfo.svc.missing')}</p>;
  const families: ('dental' | 'gp')[] = ['dental', 'gp'];
  const totals = Object.fromEntries(families.map((f) => [
    f, data.records.filter((r) => r.family === f).length,
  ])) as Record<'dental' | 'gp', number>;
  const counts = Object.fromEntries(families.map((f) => [
    f, Object.fromEntries(verdictBreakdown(data, f).map((b) => [b.verdict, b.n])),
  ])) as Record<'dental' | 'gp', Record<string, number>>;

  return (
    <>
      <h4>4. {t('eesztInfo.h4')}</h4>
      <ol className="info-steps">
        {['s1', 's2', 's3', 's4', 's5', 's6'].map((k) => (
          <li key={k}>{t(`eesztInfo.xc.${k}`)}</li>
        ))}
      </ol>
      <p>{t('eesztInfo.xc.p4')}{' '}
        <Ext href={`${REPO}/etl/crosscheck.py`}><code>etl/crosscheck.py</code></Ext>
      </p>

      <h4>5. {t('eesztInfo.h5')}</h4>
      <ul className="info-list">
        {['c1', 'c2', 'c3', 'c4', 'c5'].map((k) => (
          <li key={k}><strong>{t(`eesztInfo.xc.${k}t`)}</strong> — {t(`eesztInfo.xc.${k}`)}</li>
        ))}
      </ul>

      <h4>6. {t('eesztInfo.h6')}</h4>
      <p>{t('eesztInfo.xc.names')}</p>

      <h4>9. {t('eesztInfo.h9')}</h4>
      <table className="info-table">
        <thead>
          <tr>
            <th />
            <th className="is-num">{t('kinds.dental.label')}</th>
            <th className="is-num">{t('kinds.gp.label')}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{t('eesztInfo.xc.rTotal')}</td>
            {families.map((f) => (
              <td key={f} className="is-num">{formatNumber(totals[f])}</td>
            ))}
          </tr>
          {data.verdicts.map((verdict) => (
            <tr key={verdict}>
              <td>{t(`crosscheck.verdict.${verdict}`)}</td>
              {families.map((f) => (
                <StatCell key={f} n={counts[f][verdict] ?? 0} total={totals[f]}
                  onOpen={verdict === 'none' ? undefined
                    : () => onDrill({ scope: 'crosscheck', reason: verdict, family: f })} />
              ))}
            </tr>
          ))}
          <tr>
            <td>{t('eesztInfo.xc.rEesztOnly')}</td>
            {families.map((f) => (
              <td key={f} className="is-num">
                {formatNumber(data.eesztOnly.filter(
                  (r) => r.tip === (f === 'dental' ? 'FOG' : 'HSZ')).length)}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
      <p>{t('eesztInfo.xc.p9')}</p>

      <h4>12. {t('eesztInfo.h12')}</h4>
      <ul className="info-list">
        {['l1', 'l2', 'l3'].map((k) => <li key={k}>{t(`eesztInfo.xc.${k}`)}</li>)}
      </ul>
    </>
  );
}

/* ---------------- the dialog ---------------- */

export function EesztInfoModal({ open, onClose, data }: {
  open: boolean; onClose: () => void; data: EesztRaw;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const latest = useAppStore((s) => s.latest);
  const extra = useDentalExtra();
  const xcheck = useCrosscheck();
  const [tab, setTab] = useState<Tab>('districts');
  const [drill, setDrill] = useState<Drill | null>(null);
  // a filled district in a drill-down table opens its NEAK record
  const [neakFin, setNeakFin] = useState<string | null>(null);
  const renderCell = useMemo(() => makeCellRenderer(setNeakFin), []);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const src = data.sources ?? {};
  const registers: [keyof typeof src & string, 'finszolg' | 'euszolg' | 'engedely', string][] = [
    ['neak_finszolg', 'finszolg', t('eesztInfo.regFinszolg')],
    ['euszolg', 'euszolg', t('eesztInfo.regEuszolg')],
    ['euszolg_engedely', 'engedely', t('eesztInfo.regEngedely')],
  ];

  const drillData = useMemo(() => {
    if (!drill) return null;
    if (drill.scope === 'districts') {
      const snap = latest?.kinds[drill.kind];
      return snap ? buildReasonRows(snap, data, drill.reason) : null;
    }
    if (drill.scope === 'crosscheck') {
      return {
        rows: candidateRows(xcheck, drill.family, drill.reason),
        columns: CANDIDATE_COLUMNS,
        expanded: true,
      };
    }
    return extraReasonRows(extra, drill.group, drill.reason);
  }, [drill, latest, data, extra, xcheck]);

  return (
    <dialog ref={ref} className="vacancy-dialog info-dialog" onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}>
      <div className="vacancy-dialog__panel info-dialog__panel">
        <header className="vacancy-dialog__head">
          <div>
            <h3>{t('eesztInfo.title')}</h3>
            <p>{t('eesztInfo.subtitle', { asOf: data.asOf, month: data.dataMonth })}</p>
          </div>
          <button className="vacancy-dialog__close" onClick={onClose}
            aria-label={t('stats.tableClose')}>×</button>
        </header>

        <div className="info-dialog__body">
          <h4>1. {t('eesztInfo.h1')}</h4>
          <p>{t('eesztInfo.p1')}</p>

          <h4>2. {t('eesztInfo.h2')}</h4>
          <table className="info-table">
            <thead>
              <tr>
                <th>{t('eesztInfo.thRegister')}</th>
                <th>{t('eesztInfo.thContent')}</th>
                <th>{t('eesztInfo.thRows')}</th>
                <th>{t('eesztInfo.thArchive')}</th>
              </tr>
            </thead>
            <tbody>
              {registers.map(([name, entity, content]) => (
                <tr key={name}>
                  <td><Ext href={eesztLink(entity)}>{src[name]?.entityId ?? name}</Ext></td>
                  <td>{content}</td>
                  <td className="is-num">{src[name] ? formatNumber(src[name].rows) : '–'}</td>
                  <td>{src[name]
                    ? <Ext href={`${REPO}/${src[name].file}`}><code>{src[name].file}</code></Ext>
                    : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>{t('eesztInfo.p2')}</p>

          <h4>3. {t('eesztInfo.h3')}</h4>
          <p>{t('eesztInfo.p3a')}</p>
          <pre className="embed-snippet"><code>GET https://www.eeszt.gov.hu/torzspublikacio-portlet/rest/torzsvizualizacio/getEntity?entityId=&lt;ID&gt;&amp;page=&lt;0,1,2,…&gt;&amp;size=500</code></pre>
          <p>{t('eesztInfo.p3b')}{' '}
            <Ext href={`${REPO}/etl/fetch_eeszt.py`}><code>etl/fetch_eeszt.py</code></Ext>
          </p>

          <p className="info-tabs__lead">{t('eesztInfo.tabsLead')}</p>
          <div className="info-tabs" role="tablist">
            {TABS.map((id) => (
              <button key={id} role="tab" aria-selected={tab === id}
                className={`info-tabs__tab${tab === id ? ' is-active' : ''}`}
                onClick={() => setTab(id)}>
                {t(`eesztInfo.tab.${id}`)}
              </button>
            ))}
          </div>

          <div className="info-tabs__panel" role="tabpanel">
            {tab === 'districts' ? <DistrictsTab data={data} onDrill={setDrill} />
              : tab === 'crosscheck' ? <CrosscheckTab data={xcheck} onDrill={setDrill} />
                : <ServicesTab tab={tab} extra={extra} onDrill={setDrill} />}
          </div>
        </div>
      </div>

      {drill?.scope === 'districts' && (
        <NeakDetailModal fin={neakFin} kind={drill.kind}
          onClose={() => setNeakFin(null)} />
      )}
      {drill && drillData && (
        <DataTableModal
          open
          onClose={() => setDrill(null)}
          title={drill.scope === 'crosscheck'
            ? t(`crosscheck.verdict.${drill.reason}`)
            : t(`eeszt.reason.${drill.reason}`)}
          subtitle={drill.scope === 'crosscheck'
            ? t('eesztInfo.xc.drillSubtitle', { kind: t(`kinds.${drill.family}.adj`) })
            : drill.scope === 'districts'
            ? t(drillData.expanded ? 'eesztInfo.drillSubtitleLicences' : 'eesztInfo.drillSubtitle', {
              kind: t(`kinds.${drill.kind}.adj`),
              n: formatNumber('districts' in drillData ? drillData.districts : 0),
            })
            : t(drillData.expanded ? 'eesztInfo.svc.drillSubtitleLicences' : 'eesztInfo.svc.drillSubtitle', {
              group: t(`extra.${drill.group}Title`),
              n: formatNumber('services' in drillData ? drillData.services : 0),
            })}
          countUnit={drillData.expanded ? 'rows'
            : drill.scope === 'districts' ? 'districts' : 'services'}
          rows={drillData.rows}
          columns={drillData.columns}
          filename={drill.scope === 'districts'
            ? `praxisterkep-eeszt-${drill.kind}-${drill.reason}`
            : drill.scope === 'crosscheck'
              ? `praxisterkep-keresztellenorzes-${drill.family}-${drill.reason}`
              : `praxisterkep-fogaszat-${drill.group}-${drill.reason}`}
          renderCell={drill.scope === 'districts' ? renderCell : renderExtraCell}
        />
      )}
    </dialog>
  );
}
