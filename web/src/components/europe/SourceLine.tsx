// Where a measure comes from: the publisher, the dataset, the day it was
// downloaded, and a link to the table itself.
import { t } from '../../lib/i18n';
import type { EuropeRaw } from '../../lib/europe';

export function SourceLine({ raw, id }: { raw: EuropeRaw; id: string }) {
  const ind = raw.indicators[id];
  const uk = Object.keys(ind.sourceByGeo).length > 0;
  return (
    <p className="section__source">
      {t(ind.source === 'oecd' ? 'europe.source.oecd' : 'europe.source.eurostat',
        { dataset: ind.dataset, fetched: ind.fetched })}{' '}
      <a href={ind.url} target="_blank" rel="noopener noreferrer">{t('europe.source.open')}</a>
      {uk && ` ${t('europe.source.ukOecd')}`}
    </p>
  );
}
