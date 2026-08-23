// Combined directory modal: filled + vacant/dissolved districts of the
// active kind in one sortable, filterable table. Opened from the search
// section. Renders at most ROW_CAP rows — the filters narrow the rest.
import { useEffect, useMemo, useRef, useState } from 'react';
import { t } from '../lib/i18n';
import { formatMonth, formatNumber } from '../lib/format';
import {
  directoryRows,
  filterDirectoryRows,
  sortRows,
  type DirectoryRow,
} from '../lib/selectors';
import type { PraxisType, Snapshot } from '../types';

const ROW_CAP = 500;

const COLUMNS: { key: keyof DirectoryRow & string; labelKey: string }[] = [
  { key: 'settlement', labelKey: 'stats.thSettlement' },
  { key: 'county', labelKey: 'stats.thCounty' },
  { key: 'district', labelKey: 'stats.thDistrict' },
  { key: 'type', labelKey: 'stats.thType' },
  { key: 'status', labelKey: 'stats.thStatus' },
  { key: 'doctor', labelKey: 'stats.thDoctor' },
  { key: 'address', labelKey: 'stats.thAddress' },
  { key: 'vacantSince', labelKey: 'stats.thSince' },
];

const STATUS_LABEL_KEYS = {
  filled: 'stats.statusFilled',
  vacant: 'stats.statusVacant',
  dissolved: 'stats.statusDissolved',
} as const;

const STATUS_BADGES = {
  filled: 'badge--ok',
  vacant: 'badge--vacant',
  dissolved: 'badge--dissolved',
} as const;

export function DirectoryTableModal({ snapshot, open, onClose }: {
  snapshot: Snapshot;
  open: boolean;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [sortKey, setSortKey] = useState<keyof DirectoryRow & string>('settlement');
  const [dir, setDir] = useState<'asc' | 'desc'>('asc');
  const [county, setCounty] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const allRows = useMemo(() => directoryRows(snapshot), [snapshot]);
  const rows = useMemo(
    () => sortRows(
      filterDirectoryRows(allRows, { county, type, status, query }),
      sortKey, dir,
    ),
    [allRows, county, type, status, query, sortKey, dir],
  );
  const counties = useMemo(
    () => [...new Set(allRows.map((r) => r.county))].sort((a, b) => a.localeCompare(b, 'hu')),
    [allRows],
  );
  const types = useMemo(
    () => [...new Set(allRows.map((r) => r.type))] as PraxisType[],
    [allRows],
  );
  const statuses = useMemo(
    () => [...new Set(allRows.map((r) => r.status))],
    [allRows],
  );

  function onSort(key: keyof DirectoryRow & string) {
    if (key === sortKey) {
      setDir(dir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setDir('asc');
    }
  }

  const visible = rows.slice(0, ROW_CAP);

  return (
    <dialog
      ref={dialogRef}
      className="vacancy-dialog"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose();
      }}
    >
      <div className="vacancy-dialog__panel">
        <header className="vacancy-dialog__head">
          <div>
            <h3>{t('stats.directoryTitle', { month: formatMonth(snapshot.month) })}</h3>
            <p>
              {rows.length === allRows.length
                ? t('stats.tableCount', { n: formatNumber(allRows.length) })
                : t('stats.tableCountFiltered', {
                    n: formatNumber(rows.length),
                    total: formatNumber(allRows.length),
                  })}
              {' · '}{t('stats.sortHint')}
            </p>
          </div>
          <button className="vacancy-dialog__close" onClick={onClose}
            aria-label={t('stats.tableClose')}>
            ×
          </button>
        </header>
        <div className="vacancy-dialog__filters">
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">{t('stats.filterStatusAll')}</option>
            {statuses.map((st) => (
              <option key={st} value={st}>{t(STATUS_LABEL_KEYS[st])}</option>
            ))}
          </select>
          <select value={county} onChange={(e) => setCounty(e.target.value)}>
            <option value="">{t('stats.filterCountyAll')}</option>
            {counties.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">{t('stats.filterTypeAll')}</option>
            {types.map((ty) => (
              <option key={ty} value={ty}>{t(`praxisTypes.${ty}`)}</option>
            ))}
          </select>
          <input type="search" value={query} placeholder={t('stats.filterSearch')}
            onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="vacancy-dialog__scroll">
          <table>
            <thead>
              <tr>
                {COLUMNS.map((c) => (
                  <th key={c.key}
                    aria-sort={sortKey === c.key
                      ? (dir === 'asc' ? 'ascending' : 'descending')
                      : undefined}>
                    <button onClick={() => onSort(c.key)}>
                      {t(c.labelKey)}
                      {sortKey === c.key && <span>{dir === 'asc' ? ' ▲' : ' ▼'}</span>}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.id}>
                  <td>{r.settlement}</td>
                  <td>{r.county}</td>
                  <td>{r.district || '–'}</td>
                  <td>{t(`praxisTypes.${r.type}`)}</td>
                  <td>
                    <span className={`badge ${STATUS_BADGES[r.status]}`}>
                      {t(STATUS_LABEL_KEYS[r.status])}
                    </span>
                  </td>
                  <td>{r.doctor || '–'}</td>
                  <td>{r.address}</td>
                  <td>{r.vacantSince ? formatMonth(r.vacantSince) : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > ROW_CAP && (
            <p className="vacancy-dialog__cap">
              {t('stats.rowsCapped', {
                cap: formatNumber(ROW_CAP),
                n: formatNumber(rows.length),
              })}
            </p>
          )}
        </div>
      </div>
    </dialog>
  );
}
