// Districts that left the vacancy list since the previous archived month.
// The previous month's snapshot is fetched on demand; a praxis that now
// appears among the filled praxes is shown as filled — with the NEAK-
// published contracted physician's name (allowed for filled praxes only).
import { useEffect, useMemo } from 'react';
import { t, tKind } from '../lib/i18n';
import { formatMonth } from '../lib/format';
import { primarySite } from '../lib/selectors';
import { useAppStore, useHistoryEntries, useSnapshot } from '../store/useAppStore';

const LIMIT = 12;

export function DelistedList() {
  const kind = useAppStore((s) => s.kind);
  const snapshot = useSnapshot()!;
  const entries = useHistoryEntries();
  const ensureMonth = useAppStore((s) => s.ensureMonth);
  const prevMonth = entries.length >= 2 ? entries[entries.length - 2].month : null;
  const prev = useAppStore(
    (s) => (prevMonth ? s.monthCache[`${s.kind}/${prevMonth}`] : undefined),
  );

  useEffect(() => {
    if (prevMonth) void ensureMonth(prevMonth);
  }, [prevMonth, kind, ensureMonth]);

  const rows = useMemo(() => {
    if (!prev) return [];
    const curIds = new Set(snapshot.praxes.map((p) => p.id));
    const filledById = new Map(snapshot.filledPraxes.map((f) => [f.id, f]));
    return prev.praxes
      .filter((p) => p.status === 'vacant' && !curIds.has(p.id))
      .map((p) => {
        const site = primarySite(p);
        return {
          id: p.id,
          settlement: site?.settlement ?? '',
          county: p.county,
          type: p.type,
          filled: filledById.get(p.id) ?? null,
        };
      })
      .sort((a, b) => Number(b.filled !== null) - Number(a.filled !== null)
        || a.settlement.localeCompare(b.settlement, 'hu'));
  }, [prev, snapshot]);

  if (!prevMonth || !prev) return null;
  return (
    <figure className="chart-card chart-card--tall">
      <figcaption>
        <h3>{t('stats.delistedTitle')}</h3>
        <p>{tKind('stats.delistedExplain', kind, {
          from: formatMonth(prevMonth),
          to: formatMonth(snapshot.month),
        })}</p>
      </figcaption>
      {rows.length === 0 ? (
        <p className="praxis-line praxis-line--faint">{t('stats.delistedNone')}</p>
      ) : (
        <>
          <ul className="delisted-list">
            {rows.slice(0, LIMIT).map((r) => (
              <li key={r.id}>
                <span className="delisted-list__place">
                  <strong>{r.settlement}</strong>
                  <span>{r.county} · {t(`praxisTypes.${r.type}`)}</span>
                </span>
                {r.filled ? (
                  <span className="delisted-list__status">
                    <span className="badge badge--ok">{t('stats.delistedFilled')}</span>
                    {r.filled.doctor && <span>{r.filled.doctor}</span>}
                  </span>
                ) : (
                  <span className="delisted-list__status">
                    <span className="badge badge--muted">{t('stats.delistedGone')}</span>
                  </span>
                )}
              </li>
            ))}
          </ul>
          {rows.length > LIMIT && (
            <p className="praxis-line praxis-line--faint">
              {t('stats.delistedMore', { n: rows.length - LIMIT })}
            </p>
          )}
          <p className="praxis-line praxis-line--faint">{t('stats.delistedNote')}</p>
        </>
      )}
    </figure>
  );
}
