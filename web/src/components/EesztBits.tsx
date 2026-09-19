// Inline EESZT supplement pieces for the search card: a per-district line
// and the settlement's licensed-surgery directory. Both render nothing
// until the (optional) supplement has loaded.
import { t, tKind } from '../lib/i18n';
import {
  eesztPraxis, eesztSettlement, takesOnCall, useEeszt,
} from '../lib/eeszt';
import type { PraxisKind } from '../types';

export function EesztLine({ fin }: { fin: string }) {
  const data = useEeszt();
  const e = eesztPraxis(data, fin);
  if (!e || (!e.districtNo && !e.licence && !e.provider)) return null;
  const lic = e.licence;
  return (
    <span className="eeszt-line">
      <span className="eeszt-tag">{t('eeszt.tag')}</span>
      {e.districtNo && <span>{e.districtNo}</span>}
      {lic && (
        <span>
          {t('eeszt.licence')}: {lic.postalCode} {lic.settlement}, {lic.address}
          {!lic.settlementMatch && (
            <em className="eeszt-warn"> ({t('eeszt.licenceMismatch')})</em>
          )}
        </span>
      )}
      {lic && lic.onCall && (
        <span>{t('eeszt.onCall')}: {lic.onCall}</span>
      )}
      {lic && (
        <span>{lic.publicFunded ? t('eeszt.publicFunded') : t('eeszt.notPublicFunded')}</span>
      )}
      {e.provider && (
        <span>{t('eeszt.provider')}: {e.provider}
          {e.institutionCode && ` (${t('eeszt.institutionCode')}: ${e.institutionCode})`}
        </span>
      )}
    </span>
  );
}

export function EesztSettlementList({ settlement, kind }: {
  settlement: string; kind: PraxisKind;
}) {
  const data = useEeszt();
  if (!data) return null;
  const rows = eesztSettlement(data, settlement, kind);
  return (
    <div className="eeszt-settlement">
      <h4 className="settlement-card__subhead">
        {tKind('eeszt.settlementListTitle', kind)}
      </h4>
      {rows.length === 0 ? (
        <p className="praxis-line praxis-line--faint">{tKind('eeszt.noSettlementLicence', kind)}</p>
      ) : (
        <ul className="eeszt-settlement__list">
          {rows.map((r, i) => (
            <li key={`${r.address}-${r.profession}-${i}`}>
              <span className="eeszt-settlement__addr">{r.postalCode} {r.address}</span>
              <span className="eeszt-settlement__meta">
                {r.profession}
                {' · '}
                {r.publicFunded ? t('eeszt.publicFunded') : t('eeszt.notPublicFunded')}
                {takesOnCall(r.onCall) && ` · ${t('eeszt.onCall')}: ${r.onCall}`}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="praxis-line praxis-line--faint">
        {t('eeszt.settlementListNote', { asOf: data.asOf })}
      </p>
    </div>
  );
}
