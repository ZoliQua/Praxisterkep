// Shared cell rendering for the EESZT data browsers: colour-coded badges for
// the categorical columns (the same colours the charts use), EESZT deep links
// for the trace codes, and a clickable "Betöltött" status that opens the NEAK
// record of the district.
import { t } from '../lib/i18n';
import { eesztLink, takesOnCall } from '../lib/eeszt';
import { TYPE_COLORS, serviceTypeColor } from '../lib/palette';
import type { ColDef, Row } from '../lib/eesztTable';
import type { PraxisType } from '../types';

const PRAXIS_TYPES: PraxisType[] = ['adult', 'child', 'mixed', 'school'];

function badge(text: string, cls: string) {
  return <span className={`badge ${cls}`}>{text}</span>;
}

export function statusBadge(status: string) {
  return status === t('stats.statusFilled') ? 'badge--ok'
    : status === t('stats.statusDissolved') ? 'badge--dissolved' : 'badge--vacant';
}

/** the praxis type keeps its chart colour; the row carries the localized label */
function typeBadge(label: string) {
  const key = PRAXIS_TYPES.find((k) => t(`praxisTypes.${k}`) === label);
  const color = key ? TYPE_COLORS[key] : undefined;
  return (
    <span className="badge" style={color ? { background: `${color}2e`, color } : undefined}>
      {label}
    </span>
  );
}

function boolBadge(value: boolean | null, falseClass: string) {
  if (value === null) return <span className="cell-empty">–</span>;
  return badge(value ? t('eeszt.yes') : t('eeszt.no'), value ? 'badge--ok' : falseClass);
}

function codeLink(href: string, text: string) {
  return <a className="eeszt-code" href={href} target="_blank" rel="noopener">{text}</a>;
}

const baseRenderer = makeCellRenderer();

/** the non-district services: the service type carries the colour, the care
 *  level is plain text (it is not a district status) */
export function renderExtraCell(col: ColDef, row: Row): React.ReactNode | undefined {
  switch (col.key) {
    case 'unitType':
    case 'type': {
      if (!row[col.key]) return undefined;
      const label = String(row[col.key]);
      const color = serviceTypeColor(label);
      return <span className="badge" style={{ background: `${color}2e`, color }}>{label}</span>;
    }
    case 'status':
      return undefined; // the care level reads better unstyled
    case 'reason':
      return row.reason ? badge(String(row.reason), 'badge--muted') : undefined;
    default:
      return baseRenderer(col, row);
  }
}

/** `onFilled` makes the "Betöltött" status open that district's NEAK record */
export function makeCellRenderer(onFilled?: (fin: string) => void) {
  return function renderCell(col: ColDef, row: Row): React.ReactNode | undefined {
    switch (col.key) {
      case 'status': {
        const status = String(row.status);
        const cls = statusBadge(status);
        if (onFilled && row.fin && status === t('stats.statusFilled')) {
          return (
            <button className={`badge ${cls} badge--button`} title={t('neak.open')}
              onClick={() => onFilled(String(row.fin))}>{status}</button>
          );
        }
        return badge(status, cls);
      }
      case 'type':
        return row.type ? typeBadge(String(row.type)) : undefined;
      case 'eesztState':
        return row.eesztState
          ? badge(String(row.eesztState),
            row.eesztState === t('eeszt.stateLicence') ? 'badge--ok' : 'badge--muted')
          : undefined;
      case 'settlementMatch':
        return boolBadge(row.settlementMatch as boolean | null, 'badge--vacant');
      case 'providerMatch':
        return boolBadge(row.providerMatch as boolean | null, 'badge--vacant');
      case 'publicFunded':
        return boolBadge(row.publicFunded as boolean | null, 'badge--muted');
      case 'onCall':
        return row.onCall
          ? badge(String(row.onCall),
            takesOnCall(String(row.onCall)) ? 'badge--ok' : 'badge--muted')
          : undefined;
      // trace columns open the exact source row on the public EESZT portal
      case 'fin':
        return row.fin
          ? codeLink(eesztLink('finszolg', 'FINKOD', String(row.fin)), String(row.fin))
          : undefined;
      case 'unitCode': {
        if (!row.unitCode) return undefined;
        const first = String(row.unitCode).split(', ')[0];
        return codeLink(eesztLink('engedely', 'SZERVEZETI_EGYSEG_KOD', first), String(row.unitCode));
      }
      case 'licenceId':
        return row.licenceId
          ? codeLink(eesztLink('engedely', 'ENGEDELY_AZONOSITO', String(row.licenceId)),
            String(row.licenceId))
          : undefined;
      case 'providerId':
        return row.providerId
          ? codeLink(eesztLink('euszolg', 'EUSZOLG_AZONOSITO', String(row.providerId)),
            String(row.providerId))
          : undefined;
      default:
        return undefined;
    }
  };
}
