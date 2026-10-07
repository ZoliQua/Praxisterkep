// What the page you are looking at is narrowed to, shown in the same place on
// every page. Before this, a county picked on the map was forgotten the moment
// you opened an analysis; now it travels, and this bar is where it can be seen
// and dropped again.
//
// It stays out of the way when nothing is selected: an empty bar on a page
// about the whole country would be noise.
import { t } from '../lib/i18n';
import { useContextHref, useContextStore } from '../lib/context';
import { settlementHref, useSettlementBySlug } from '../lib/settlementLink';

export function ContextBar() {
  const county = useContextStore((s) => s.county);
  const settlement = useContextStore((s) => s.settlement);
  const setCounty = useContextStore((s) => s.setCounty);
  const setSettlement = useContextStore((s) => s.setSettlement);
  const place = useSettlementBySlug(settlement);
  const href = useContextHref();

  if (!county && !settlement) return null;

  return (
    <div className="contextbar">
      <div className="contextbar__inner">
        <span className="contextbar__label">{t('context.label')}</span>
        {county && (
          <span className="contextbar__chip">
            <a href={href(`megye.html#${encodeURIComponent(county)}`)}>{county}</a>
            <button type="button" aria-label={t('context.clearCounty', { county })}
              onClick={() => setCounty(null)}>×</button>
          </span>
        )}
        {settlement && (
          <span className="contextbar__chip">
            <a href={settlementHref(settlement)}>{place?.name ?? settlement}</a>
            <button type="button" aria-label={t('context.clearSettlement')}
              onClick={() => setSettlement(null)}>×</button>
          </span>
        )}
        <button type="button" className="contextbar__clear"
          onClick={() => { setCounty(null); setSettlement(null); }}>
          {t('context.clearAll')}
        </button>
      </div>
    </div>
  );
}
