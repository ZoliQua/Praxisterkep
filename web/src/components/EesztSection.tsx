// "EESZT-kiegészítés": the supplement as its own section — how well the
// public EESZT master data could be joined (per branch, fully transparent),
// and a filterable table of every district of the active branch with the
// EESZT fields. Vacant/dissolved rows never carry a provider name.
import { useMemo, useState } from 'react';
import { t, tKind } from '../lib/i18n';
import { formatNumber, formatPercent } from '../lib/format';
import { primarySite } from '../lib/selectors';
import { eesztPraxis, takesOnCall, useEeszt } from '../lib/eeszt';
import { useAppStore, useSnapshot } from '../store/useAppStore';

const ROW_CAP = 200;
type Status = 'filled' | 'vacant' | 'dissolved';

export function EesztSection() {
  const data = useEeszt();
  const snapshot = useSnapshot()!;
  const kind = useAppStore((s) => s.kind);
  const [county, setCounty] = useState('');
  const [status, setStatus] = useState<'' | Status>('');
  const [query, setQuery] = useState('');
  const [onlyMismatch, setOnlyMismatch] = useState(false);

  const rows = useMemo(() => {
    const all: { id: string; settlement: string; county: string; status: Status }[] = [
      ...snapshot.praxes.map((p) => ({
        id: p.id,
        settlement: primarySite(p)?.settlement ?? '',
        county: p.county,
        status: p.status as Status,
      })),
      ...snapshot.filledPraxes.map((f) => ({
        id: f.id, settlement: f.settlement, county: f.county, status: 'filled' as Status,
      })),
    ];
    return all.sort((a, b) => a.settlement.localeCompare(b.settlement, 'hu'));
  }, [snapshot]);

  const counties = useMemo(
    () => [...new Set(rows.map((r) => r.county))].sort((a, b) => a.localeCompare(b, 'hu')),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (county && r.county !== county) return false;
      if (status && r.status !== status) return false;
      if (q && !r.settlement.toLowerCase().includes(q)) return false;
      if (onlyMismatch) {
        const lic = eesztPraxis(data, r.id)?.licence;
        if (!lic || lic.settlementMatch) return false;
      }
      return true;
    });
  }, [rows, county, status, query, onlyMismatch, data]);

  if (!data) return null;
  const st = data.stats[kind] ?? {};
  const total = st.total ?? 0;
  const cov: [string, number][] = [
    [t('eeszt.covFin'), st.fin ?? 0],
    [t('eeszt.covLicence'), st.licence ?? 0],
    [t('eeszt.covSettlement'), st.settlementMatch ?? 0],
    [t('eeszt.covProvider'), st.providerMatch ?? 0],
  ];

  return (
    <section className="section container" id="eeszt">
      <h2 className="section__heading">{t('eeszt.heading')}</h2>
      <p className="section__explain">{tKind('eeszt.explain', kind, { asOf: data.asOf })}</p>

      <div className="eeszt-coverage">
        <div className="eeszt-coverage__total">
          <strong>{formatNumber(total)}</strong>
          <span>{tKind('eeszt.covTotal', kind)}</span>
        </div>
        {cov.map(([label, n]) => (
          <div key={label} className="eeszt-coverage__row">
            <span className="eeszt-coverage__label">{label}</span>
            <span className="eeszt-coverage__bar">
              <span style={{ width: `${total ? (n / total) * 100 : 0}%` }} />
            </span>
            <span className="eeszt-coverage__val">
              {formatNumber(n)} <em>({total ? formatPercent(n / total) : '–'})</em>
            </span>
          </div>
        ))}
        {(st.ambiguous ?? 0) > 0 && (
          <p className="praxis-line praxis-line--faint">
            {t('eeszt.covAmbiguous', { n: st.ambiguous })}
          </p>
        )}
      </div>

      <div className="vacancy-dialog__filters eeszt-filters">
        <select value={county} onChange={(e) => setCounty(e.target.value)}>
          <option value="">{t('stats.filterCountyAll')}</option>
          {counties.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value as '' | Status)}>
          <option value="">{t('stats.filterStatusAll')}</option>
          <option value="filled">{t('stats.statusFilled')}</option>
          <option value="vacant">{t('stats.statusVacant')}</option>
          {kind === 'dental' && <option value="dissolved">{t('stats.statusDissolved')}</option>}
        </select>
        <input type="search" value={query} placeholder={t('search.placeholder')}
          onChange={(e) => setQuery(e.target.value)} />
        <label className="map-check">
          <input type="checkbox" checked={onlyMismatch}
            onChange={(e) => setOnlyMismatch(e.target.checked)} />
          {t('eeszt.onlyMismatch')}
        </label>
      </div>

      <div className="stats-table__scroll eeszt-table">
        <table>
          <thead>
            <tr>
              <th>{t('stats.thSettlement')}</th>
              <th>{t('stats.thStatus')}</th>
              <th>{t('eeszt.thDistrictNo')}</th>
              <th>{t('eeszt.licence')}</th>
              <th>{t('eeszt.onCall')}</th>
              <th>{t('eeszt.thFunded')}</th>
              <th>{t('eeszt.provider')}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, ROW_CAP).map((r) => {
              const e = eesztPraxis(data, r.id);
              const lic = e?.licence;
              return (
                <tr key={`${r.status}-${r.id}`}>
                  <td>{r.settlement}<small>{r.county}</small></td>
                  <td>
                    <span className={`badge ${r.status === 'filled' ? 'badge--ok'
                      : r.status === 'dissolved' ? 'badge--dissolved' : 'badge--vacant'}`}>
                      {r.status === 'filled' ? t('stats.statusFilled')
                        : r.status === 'dissolved' ? t('stats.statusDissolved')
                          : t('stats.statusVacant')}
                    </span>
                  </td>
                  <td>{e?.districtNo ?? '–'}</td>
                  <td>
                    {lic ? (
                      <>
                        {lic.postalCode} {lic.settlement}, {lic.address}
                        {!lic.settlementMatch && (
                          <em className="eeszt-warn"> · {t('eeszt.licenceMismatch')}</em>
                        )}
                      </>
                    ) : e ? t('eeszt.noLicence') : t('eeszt.noFin')}
                  </td>
                  <td>{lic ? (takesOnCall(lic.onCall) ? lic.onCall : t('eeszt.noOnCall')) : '–'}</td>
                  <td>{lic ? (lic.publicFunded ? t('eeszt.yes') : t('eeszt.no')) : '–'}</td>
                  {/* provider only exists for filled praxes (ETL guard) */}
                  <td>{e?.provider ?? '–'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="praxis-line praxis-line--faint">
        {filtered.length > ROW_CAP
          ? t('stats.rowsCapped', { cap: ROW_CAP, n: formatNumber(filtered.length) })
          : t('stats.tableCountFiltered', { n: filtered.length, total: rows.length })}
      </p>
    </section>
  );
}
