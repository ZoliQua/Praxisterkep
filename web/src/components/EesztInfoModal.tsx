// "Hogyan illesztettük?" — the full, traceable account of how the EESZT
// supplement is built: sources (with live portal links and archive files),
// download, the code chain step by step, every check, the name policy,
// geocoding, results (live numbers from eeszt.json), a worked example with
// deep links, and how anyone can re-verify it.
import { useEffect, useMemo, useRef, useState } from 'react';
import { t } from '../lib/i18n';
import { formatNumber, formatPercent } from '../lib/format';
import { eesztLink, eesztPraxis, type EesztRaw } from '../lib/eeszt';
import { buildReasonRows } from '../lib/eesztTable';
import { useAppStore } from '../store/useAppStore';
import { DataTableModal } from './DataTableModal';

const REPO = 'https://github.com/ZoliQua/OEP-Alapellatas/blob/main';
const EXAMPLE_FIN = '020066099'; // Sásd, dental — also a vacant district

function Ext({ href, children }: { href: string; children: React.ReactNode }) {
  return <a href={href} target="_blank" rel="noopener">{children}</a>;
}

export function EesztInfoModal({ open, onClose, data }: {
  open: boolean; onClose: () => void; data: EesztRaw;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const latest = useAppStore((s) => s.latest);
  // which reason's districts are being inspected, for which branch
  const [drill, setDrill] = useState<{ reason: string; kind: 'dental' | 'gp' } | null>(null);
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

  const ex = eesztPraxis(data, EXAMPLE_FIN);
  const exLic = ex?.licence;
  const exTrace = ex?.trace;

  const kinds: ('dental' | 'gp')[] = ['dental', 'gp'];
  const statCell = (k: 'dental' | 'gp', key: string) => {
    const st = data.stats[k] ?? {};
    const n = st[key] ?? 0;
    return { n, text: `${formatNumber(n)} (${st.total ? formatPercent(n / st.total) : '–'})` };
  };
  // the four reasons can be opened row by row
  const DRILLABLE = new Set(['noUnitLicence', 'ambiguous', 'noFin', 'otherProfession']);

  const drillData = useMemo(() => {
    if (!drill || !latest) return null;
    const snap = latest.kinds[drill.kind];
    if (!snap) return null;
    return buildReasonRows(snap, data, drill.reason);
  }, [drill, latest, data]);

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

          <h4>4. {t('eesztInfo.h4')}</h4>
          <ol className="info-steps">
            <li>{t('eesztInfo.s1')}</li>
            <li>{t('eesztInfo.s2')}</li>
            <li>{t('eesztInfo.s3')}</li>
            <li>{t('eesztInfo.s4')}</li>
            <li>{t('eesztInfo.s5')}</li>
            <li>{t('eesztInfo.s6')}</li>
          </ol>
          <p>{t('eesztInfo.p4')}{' '}
            <Ext href={`${REPO}/etl/build_eeszt.py`}><code>etl/build_eeszt.py</code></Ext>
          </p>

          <h4>5. {t('eesztInfo.h5')}</h4>
          <ul className="info-list">
            <li><strong>{t('eesztInfo.c1t')}</strong> — {t('eesztInfo.c1')}</li>
            <li><strong>{t('eesztInfo.c2t')}</strong> — {t('eesztInfo.c2')}</li>
            <li><strong>{t('eesztInfo.c3t')}</strong> — {t('eesztInfo.c3')}</li>
            <li><strong>{t('eesztInfo.c4t')}</strong> — {t('eesztInfo.c4')}</li>
            <li><strong>{t('eesztInfo.c5t')}</strong> — {t('eesztInfo.c5')}</li>
          </ul>

          <h4>6. {t('eesztInfo.h6')}</h4>
          <ul className="info-list">
            <li>{t('eesztInfo.n1')}</li>
            <li>{t('eesztInfo.n2', { n: formatNumber(kinds.reduce((a, k) => a + (data.stats[k]?.nameHidden ?? 0), 0)) })}</li>
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
                {kinds.map((k) => <td key={k} className="is-num">{formatNumber(data.stats[k]?.total ?? 0)}</td>)}
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
                  {kinds.map((k) => {
                    const { n, text } = statCell(k, key);
                    return (
                      <td key={k} className="is-num">
                        {DRILLABLE.has(key) && n > 0 ? (
                          <button className="info-drill" onClick={() => setDrill({ reason: key, kind: k })}
                            title={t('eesztInfo.drillOpen')}>{text}</button>
                        ) : text}
                      </td>
                    );
                  })}
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
                  <Ext href={eesztLink('engedely', 'SZERVEZETI_EGYSEG_KOD', exTrace.units[0])}>{t('eesztInfo.open')}</Ext>
                </li>
                <li>
                  {t('eesztInfo.e3', {
                    licence: exTrace.licenceId,
                    address: `${exLic.postalCode} ${exLic.settlement}, ${exLic.address}`,
                    profession: exLic.profession,
                  })}{' '}
                  <Ext href={eesztLink('engedely', 'ENGEDELY_AZONOSITO', exTrace.licenceId)}>{t('eesztInfo.open')}</Ext>
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
            <li>{t('eesztInfo.v1')}</li>
            <li>{t('eesztInfo.v2')}</li>
            <li>{t('eesztInfo.v3')}</li>
            <li>{t('eesztInfo.v4')}</li>
          </ul>

          <h4>12. {t('eesztInfo.h12')}</h4>
          <ul className="info-list">
            <li>{t('eesztInfo.l1')}</li>
            <li>{t('eesztInfo.l2')}</li>
            <li>{t('eesztInfo.l3')}</li>
            <li>{t('eesztInfo.l4')}</li>
          </ul>
        </div>
      </div>

      {drill && drillData && (
        <DataTableModal
          open
          onClose={() => setDrill(null)}
          title={t(`eeszt.reason.${drill.reason}`)}
          subtitle={t(drillData.expanded ? 'eesztInfo.drillSubtitleLicences' : 'eesztInfo.drillSubtitle', {
            kind: t(`kinds.${drill.kind}.adj`),
            n: formatNumber(drillData.districts),
          })}
          countUnit={drillData.expanded ? 'rows' : 'districts'}
          rows={drillData.rows}
          columns={drillData.columns}
          filename={`praxisterkep-eeszt-${drill.kind}-${drill.reason}`}
        />
      )}
    </dialog>
  );
}
