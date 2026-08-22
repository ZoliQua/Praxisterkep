import { useMemo, useState } from 'react';
import { t } from '../lib/i18n';
import { formatDuration, formatMonth, formatNumber, monthsBetween } from '../lib/format';
import { praxesById, primarySite, searchSettlements } from '../lib/selectors';
import { useAppStore } from '../store/useAppStore';
import type { Praxis, SettlementEntry } from '../types';

function PraxisRow({ praxis, month }: { praxis: Praxis; month: string }) {
  const site = primarySite(praxis);
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
      </span>
    </div>
  );
}

export function SearchSection() {
  const snapshot = useAppStore((s) => s.snapshot)!;
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<SettlementEntry | null>(null);

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

  return (
    <section className="section container" id="nalam">
      <h2 className="section__heading">{t('search.heading')}</h2>
      <p className="section__explain">{t('search.explain')}</p>

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
          <p className="section__explain" style={{ marginTop: 12 }}>{t('search.noResult')}</p>
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
            <span className="praxis-line">{t('search.filled')}</span>
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
              <span className="praxis-line">{t('search.noVacant')}</span>
            </div>
          )}
          {vacantHere.length > 0 && (
            <div className="settlement-card__row">
              <span className="praxis-line">{t('search.reminder')}</span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
