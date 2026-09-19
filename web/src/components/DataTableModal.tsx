// Generic data browser in a modal <dialog>: global search, a filter per
// column (text / choice / yes-no / numeric comparison), sort by any column
// (asc -> desc -> off), show/hide columns, paging, and CSV/TSV export of the
// currently filtered + sorted rows (visible columns only).
import { useEffect, useMemo, useRef, useState } from 'react';
import { t } from '../lib/i18n';
import { formatNumber } from '../lib/format';
import {
  cellText, distinctValues, filterRows, serialize, sortRows,
  type ColDef, type Filters, type Row,
} from '../lib/eesztTable';
import { downloadBlob } from '../lib/exportChart';

const PAGE_SIZES = [25, 50, 100, 500, 0]; // 0 = all

export function DataTableModal<R extends Row>({
  open, onClose, title, subtitle, rows, columns, filename, renderCell, above,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  rows: R[];
  columns: ColDef[];
  filename: string;
  /** optional custom cell rendering (e.g. status badges) */
  renderCell?: (col: ColDef, row: R) => React.ReactNode | undefined;
  /** optional toggleable panel above the table, fed the filtered rows */
  above?: { label: string; render: (rows: R[]) => React.ReactNode; defaultOn?: boolean };
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [visible, setVisible] = useState<Set<string>>(
    () => new Set(columns.filter((c) => c.visible).map((c) => c.key)),
  );
  const [filters, setFilters] = useState<Filters>({});
  const [global, setGlobal] = useState('');
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null);
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(0);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [showAbove, setShowAbove] = useState(above?.defaultOn ?? true);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const shownCols = columns.filter((c) => visible.has(c.key));
  const enumOptions = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const c of columns) if (c.type === 'enum') out[c.key] = distinctValues(rows, c.key);
    return out;
  }, [rows, columns]);

  const result = useMemo(() => {
    const f = filterRows(rows, columns, filters, global);
    return sort ? sortRows(f, sort.key, sort.dir) : f;
  }, [rows, columns, filters, global, sort]);

  const pageCount = pageSize ? Math.max(1, Math.ceil(result.length / pageSize)) : 1;
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = pageSize
    ? result.slice(safePage * pageSize, safePage * pageSize + pageSize)
    : result;
  const activeFilters = Object.values(filters).filter((v) => v !== '').length
    + (global.trim() ? 1 : 0);

  function setFilter(key: string, value: string) {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(0);
  }

  function cycleSort(key: string) {
    setSort((s) => {
      if (!s || s.key !== key) return { key, dir: 'asc' };
      if (s.dir === 'asc') return { key, dir: 'desc' };
      return null;
    });
  }

  function toggleCol(key: string) {
    setVisible((v) => {
      const next = new Set(v);
      if (next.has(key)) {
        if (next.size > 1) next.delete(key); // keep at least one column
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function exportAs(format: 'csv' | 'tsv') {
    const text = serialize(result, shownCols, format);
    const stamp = new Date().toISOString().slice(0, 10);
    downloadBlob(
      new Blob(['﻿' + text], {
        type: format === 'csv' ? 'text/csv;charset=utf-8' : 'text/tab-separated-values;charset=utf-8',
      }),
      `${filename}-${stamp}.${format}`,
    );
  }

  return (
    <dialog ref={dialogRef} className="vacancy-dialog data-dialog" onClose={onClose}
      onClick={(e) => { if (e.target === dialogRef.current) onClose(); }}>
      <div className="vacancy-dialog__panel data-dialog__panel">
        <header className="vacancy-dialog__head">
          <div>
            <h3>{title}</h3>
            <p>
              {result.length === rows.length
                ? t('stats.tableCount', { n: formatNumber(rows.length) })
                : t('stats.tableCountFiltered', {
                  n: formatNumber(result.length), total: formatNumber(rows.length),
                })}
              {subtitle ? ` · ${subtitle}` : ''}
            </p>
          </div>
          <button className="vacancy-dialog__close" onClick={onClose}
            aria-label={t('stats.tableClose')}>×</button>
        </header>

        <div className="data-dialog__toolbar">
          <input type="search" value={global} placeholder={t('dataTable.searchAll')}
            onChange={(e) => { setGlobal(e.target.value); setPage(0); }} />
          <div className="data-dialog__chooser">
            <button className="data-btn" onClick={() => setChooserOpen((o) => !o)}
              aria-expanded={chooserOpen}>
              {t('dataTable.columns', { n: visible.size, total: columns.length })} ▾
            </button>
            {chooserOpen && (
              <div className="data-dialog__chooser-menu">
                {columns.map((c) => (
                  <label key={c.key}>
                    <input type="checkbox" checked={visible.has(c.key)}
                      onChange={() => toggleCol(c.key)} />
                    {t(c.labelKey)}
                  </label>
                ))}
                <div className="data-dialog__chooser-actions">
                  <button className="data-btn"
                    onClick={() => setVisible(new Set(columns.map((c) => c.key)))}>
                    {t('dataTable.showAll')}
                  </button>
                  <button className="data-btn"
                    onClick={() => setVisible(new Set(columns.filter((c) => c.visible).map((c) => c.key)))}>
                    {t('dataTable.defaults')}
                  </button>
                </div>
              </div>
            )}
          </div>
          <button className="data-btn" disabled={activeFilters === 0}
            onClick={() => { setFilters({}); setGlobal(''); setPage(0); }}>
            {t('dataTable.clearFilters')}{activeFilters ? ` (${activeFilters})` : ''}
          </button>
          {above && (
            <button className="data-btn" aria-pressed={showAbove}
              onClick={() => setShowAbove((v) => !v)}>
              {showAbove ? '◉' : '○'} {above.label}
            </button>
          )}
          <span className="data-dialog__spacer" />
          <button className="data-btn data-btn--accent" onClick={() => exportAs('csv')}
            disabled={result.length === 0}>{t('dataTable.exportCsv')}</button>
          <button className="data-btn data-btn--accent" onClick={() => exportAs('tsv')}
            disabled={result.length === 0}>{t('dataTable.exportTsv')}</button>
        </div>

        {above && showAbove && open && (
          <div className="data-dialog__above">{above.render(result)}</div>
        )}
        <div className="vacancy-dialog__scroll">
          <table>
            <thead>
              <tr>
                {shownCols.map((c) => (
                  <th key={c.key} className={c.type === 'number' ? 'is-num' : undefined}
                    aria-sort={sort?.key === c.key
                      ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                    <button onClick={() => cycleSort(c.key)} title={t('stats.sortHint')}>
                      {t(c.labelKey)}
                      {sort?.key === c.key && <span>{sort.dir === 'asc' ? ' ▲' : ' ▼'}</span>}
                    </button>
                  </th>
                ))}
              </tr>
              <tr className="data-dialog__filter-row">
                {shownCols.map((c) => (
                  <th key={c.key}>
                    {c.type === 'enum' ? (
                      <select value={filters[c.key] ?? ''}
                        onChange={(e) => setFilter(c.key, e.target.value)}>
                        <option value="">{t('dataTable.any')}</option>
                        {enumOptions[c.key].map((v) => <option key={v} value={v}>{v}</option>)}
                      </select>
                    ) : c.type === 'bool' ? (
                      <select value={filters[c.key] ?? ''}
                        onChange={(e) => setFilter(c.key, e.target.value)}>
                        <option value="">{t('dataTable.any')}</option>
                        <option value="true">{t('eeszt.yes')}</option>
                        <option value="false">{t('eeszt.no')}</option>
                        <option value="null">{t('dataTable.empty')}</option>
                      </select>
                    ) : (
                      <input type="search" value={filters[c.key] ?? ''}
                        placeholder={c.type === 'number' ? '>=1' : '…'}
                        onChange={(e) => setFilter(c.key, e.target.value)} />
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r, i) => (
                <tr key={`${String(r.fin ?? '')}-${i}`}>
                  {shownCols.map((c) => {
                    const custom = renderCell?.(c, r);
                    return (
                      <td key={c.key} className={c.type === 'number' ? 'is-num' : undefined}>
                        {custom !== undefined ? custom : (cellText(r[c.key]) || '–')}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {pageRows.length === 0 && (
                <tr><td colSpan={shownCols.length} className="data-dialog__empty">
                  {t('dataTable.noRows')}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>

        <footer className="data-dialog__foot">
          <label>
            {t('dataTable.pageSize')}{' '}
            <select value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }}>
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>{n === 0 ? t('dataTable.all') : n}</option>
              ))}
            </select>
          </label>
          {pageSize > 0 && pageCount > 1 && (
            <div className="pager">
              <button onClick={() => setPage(0)} disabled={safePage === 0}>«</button>
              <button onClick={() => setPage(safePage - 1)} disabled={safePage === 0}>‹</button>
              <span>{t('dataTable.pageOf', { page: safePage + 1, pages: pageCount })}</span>
              <button onClick={() => setPage(safePage + 1)} disabled={safePage >= pageCount - 1}>›</button>
              <button onClick={() => setPage(pageCount - 1)} disabled={safePage >= pageCount - 1}>»</button>
            </div>
          )}
        </footer>
      </div>
    </dialog>
  );
}
