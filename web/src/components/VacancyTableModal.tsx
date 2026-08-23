// Full vacancy table in a modal <dialog>: every vacant/dissolved district of
// the active kind, sortable by any column. Opened from the stats section.
import { useEffect, useMemo, useRef, useState } from 'react';
import { t } from '../lib/i18n';
import { formatDuration, formatMonth, formatNumber } from '../lib/format';
import {
  filterPraxisRows,
  praxisTableRows,
  sortPraxisRows,
  type PraxisSortKey,
} from '../lib/selectors';
import type { PraxisType, Snapshot } from '../types';

const COLUMNS: { key: PraxisSortKey; labelKey: string; numeric?: boolean }[] = [
  { key: 'settlement', labelKey: 'stats.thSettlement' },
  { key: 'county', labelKey: 'stats.thCounty' },
  { key: 'district', labelKey: 'stats.thDistrict' },
  { key: 'type', labelKey: 'stats.thType' },
  { key: 'vacantSince', labelKey: 'stats.thSince' },
  { key: 'population', labelKey: 'stats.thPopulation', numeric: true },
];

export function VacancyTableModal({ snapshot, open, onClose }: {
  snapshot: Snapshot;
  open: boolean;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [sortKey, setSortKey] = useState<PraxisSortKey>('vacantSince');
  const [dir, setDir] = useState<'asc' | 'desc'>('asc');
  const [county, setCounty] = useState('');
  const [type, setType] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const allRows = useMemo(() => praxisTableRows(snapshot), [snapshot]);
  const rows = useMemo(
    () => sortPraxisRows(filterPraxisRows(allRows, { county, type, query }), sortKey, dir),
    [allRows, county, type, query, sortKey, dir],
  );
  const counties = useMemo(
    () => [...new Set(allRows.map((r) => r.county))].sort((a, b) => a.localeCompare(b, 'hu')),
    [allRows],
  );
  const types = useMemo(
    () => [...new Set(allRows.map((r) => r.type))] as PraxisType[],
    [allRows],
  );

  function onSort(key: PraxisSortKey) {
    if (key === sortKey) {
      setDir(dir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setDir(key === 'population' ? 'desc' : 'asc');
    }
  }

  const hasDissolved = snapshot.national.dissolved > 0;

  return (
    <dialog
      ref={dialogRef}
      className="vacancy-dialog"
      onClose={onClose}
      onClick={(e) => {
        // backdrop click closes; clicks inside the panel don't
        if (e.target === dialogRef.current) onClose();
      }}
    >
      <div className="vacancy-dialog__panel">
        <header className="vacancy-dialog__head">
          <div>
            <h3>{t('stats.tableTitle', { month: formatMonth(snapshot.month) })}</h3>
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
                    className={c.numeric ? 'is-num' : undefined}
                    aria-sort={sortKey === c.key
                      ? (dir === 'asc' ? 'ascending' : 'descending')
                      : undefined}>
                    <button onClick={() => onSort(c.key)}>
                      {t(c.labelKey)}
                      {sortKey === c.key && <span>{dir === 'asc' ? ' ▲' : ' ▼'}</span>}
                    </button>
                  </th>
                ))}
                <th className="is-num">{t('stats.thDuration')}</th>
                {hasDissolved && <th>{t('stats.thStatus')}</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.settlement}</td>
                  <td>{r.county}</td>
                  <td>{r.district || '–'}</td>
                  <td>{t(`praxisTypes.${r.type}`)}</td>
                  <td>{formatMonth(r.vacantSince)}</td>
                  <td className="is-num">
                    {r.population !== null ? formatNumber(r.population) : '–'}
                  </td>
                  <td className="is-num">{formatDuration(r.months)}</td>
                  {hasDissolved && (
                    <td>
                      {r.status === 'dissolved'
                        ? <span className="badge badge--dissolved">{t('map.countyDissolved')}</span>
                        : '–'}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </dialog>
  );
}
