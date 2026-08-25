import { useEffect, useMemo, useState } from 'react';
import { t, tKind } from '../lib/i18n';
import { formatDuration, formatMonth, formatNumber, monthsBetween } from '../lib/format';
import { praxesById, primarySite, searchSettlements } from '../lib/selectors';
import { useAppStore, useSnapshot } from '../store/useAppStore';
import { DirectoryTableModal } from './DirectoryTableModal';
import type { FilledPraxis, Praxis, SettlementEntry } from '../types';

const FILLED_LIMIT = 10;

function FilledRow({ praxis }: { praxis: FilledPraxis }) {
  return (
    <div className="settlement-card__row">
      <span className="badge badge--ok">{t(`praxisTypes.${praxis.type}`)}</span>
      <span className="praxis-line">
        {praxis.doctor && <strong>{praxis.doctor}</strong>}
        {praxis.doctor && ' · '}
        {praxis.postalCode} {praxis.settlement}, {praxis.address}
      </span>
    </div>
  );
}

function PraxisRow({ praxis, month }: { praxis: Praxis; month: string }) {
  const site = primarySite(praxis);
  const served = praxis.servedSettlements ?? [];
  return (
    <div className="settlement-card__row">
      <span className={`badge ${praxis.status === 'dissolved' ? 'badge--dissolved' : 'badge--vacant'}`}>
        {praxis.status === 'dissolved' ? t('map.popupStatusDissolved') : t('map.popupStatusVacant')}
      </span>
      <span className="praxis-line">
        {t(`praxisTypes.${praxis.type}`)} · {site?.settlement}, {site?.address} ·{' '}
        {t('map.popupVacantSince')}: <strong>{formatMonth(praxis.vacantSince)}</strong> (
        {formatDuration(monthsBetween(praxis.vacantSince, month))})
        {praxis.population ? (
          <>
            {' · '}
            {t('map.popupPopulation')}: <strong>{formatNumber(praxis.population)}</strong> {t('map.fő')}
          </>
        ) : null}
        {served.length > 1 && (
          <>
            <br />
            {t('search.servedBy')}: {served.join(', ')}
          </>
        )}
      </span>
    </div>
  );
}

export function SearchSection() {
  const snapshot = useSnapshot()!;
  const kind = useAppStore((s) => s.kind);
  // selection/query belong to one kind's snapshot; reset derives on toggle
  const [state, setState] = useState<{
    kind: string; query: string; selected: SettlementEntry | null;
  }>({ kind, query: '', selected: null });
  const query = state.kind === kind ? state.query : '';
  const selected = state.kind === kind ? state.selected : null;
  const setQuery = (q: string) => setState({ kind, query: q, selected: null });
  const setSelected = (s2: SettlementEntry | null) =>
    setState({ kind, query, selected: s2 });
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const searchReq = useAppStore((s2) => s2.searchRequest);

  // map popup link -> select that settlement here (async to avoid a
  // synchronous setState inside the effect)
  useEffect(() => {
    if (!searchReq) return;
    const entry = snapshot.settlements.find((x) => x.name === searchReq.name);
    if (!entry) return;
    const raf = requestAnimationFrame(() => setSelected(entry));
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchReq?.n, snapshot]);

  const byId = useMemo(() => praxesById(snapshot), [snapshot]);
  const hits = useMemo(
    () => (selected ? [] : searchSettlements(snapshot.settlements, query)),
    [snapshot, query, selected],
  );

  const vacantHere = selected
    ? [...selected.vacantPraxisIds, ...selected.dissolvedPraxisIds]
        .map((id) => byId.get(id))
        .filter((p): p is Praxis => p !== undefined)
    : [];

  // GP settlement entries are coverage-based, dental ones are seat-based
  const filledLabel = kind === 'gp' ? t('search.filledCoverage') : t('search.filledSeat');
  const filledHere = useMemo(() => {
    if (!selected) return [];
    return snapshot.filledPraxes.filter((p) =>
      kind === 'gp'
        ? (p.servedSettlements ?? [p.settlement]).includes(selected.name)
        : p.settlement === selected.name,
    );
  }, [snapshot, selected, kind]);

  return (
    <section className="section container" id="nalam">
      <div className="section__heading-row">
        <h2 className="section__heading">{t('search.heading')}</h2>
        <button className="icon-button" title={t('search.openDirectory')}
          aria-label={t('search.openDirectory')}
          onClick={() => setDirectoryOpen(true)}>
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <rect x="2.5" y="3.5" width="15" height="13" rx="1.5" fill="none"
              stroke="currentColor" strokeWidth="1.6" />
            <path d="M2.5 8h15M8 8v8.5M13 8v8.5" stroke="currentColor"
              strokeWidth="1.6" />
          </svg>
        </button>
      </div>
      <p className="section__explain">{tKind('search.explain', kind)}</p>

      <div className="search-box">
        <input
          type="search"
          value={selected ? selected.name : query}
          placeholder={t('search.placeholder')}
          onChange={(e) => {
            setSelected(null);
            setQuery(e.target.value);
          }}
          aria-label={t('search.placeholder')}
        />
        {hits.length > 0 && (
          <ul className="search-box__list">
            {hits.map((s) => (
              <li key={`${s.name}|${s.county}`}>
                <button onClick={() => setSelected(s)}>
                  <span>{s.name}</span>
                  <span className="muted">{s.county} {t('search.county')}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {query.length >= 2 && hits.length === 0 && !selected && (
          <p className="section__explain" style={{ marginTop: 12 }}>
            {tKind('search.noResult', kind)}
          </p>
        )}
      </div>

      {selected && (
        <div className="settlement-card">
          <h3>
            {selected.name}
            <small>{selected.county} {t('search.county')}</small>
          </h3>
          <div className="settlement-card__row">
            <span className="badge badge--ok">{selected.filled}</span>
            <span className="praxis-line">{filledLabel}</span>
          </div>
          {vacantHere.map((p) => (
            <PraxisRow key={p.id} praxis={p} month={snapshot.month} />
          ))}
          {selected.affectedByDissolved && (
            <div className="settlement-card__row">
              <span className="praxis-line">{t('search.affectedByDissolved')}</span>
            </div>
          )}
          {vacantHere.length === 0 && !selected.affectedByDissolved && (
            <div className="settlement-card__row">
              <span className="praxis-line">{tKind('search.noVacant', kind)}</span>
            </div>
          )}
          {vacantHere.length > 0 && (
            <div className="settlement-card__row">
              <span className="praxis-line">{t('search.reminder')}</span>
            </div>
          )}
          {filledHere.length > 0 && (
            <>
              <h4 className="settlement-card__subhead">
                {kind === 'gp' ? t('search.filledListTitleCoverage') : t('search.filledListTitle')}
              </h4>
              {filledHere.slice(0, FILLED_LIMIT).map((p) => (
                <FilledRow key={p.id} praxis={p} />
              ))}
              {filledHere.length > FILLED_LIMIT && (
                <div className="settlement-card__row">
                  <span className="praxis-line">
                    {t('search.filledMore', { n: filledHere.length - FILLED_LIMIT })}
                  </span>
                </div>
              )}
              <div className="settlement-card__row">
                <span className="praxis-line praxis-line--faint">{t('search.doctorNote')}</span>
              </div>
            </>
          )}
        </div>
      )}

      <DirectoryTableModal snapshot={snapshot} open={directoryOpen}
        onClose={() => setDirectoryOpen(false)} />
    </section>
  );
}
