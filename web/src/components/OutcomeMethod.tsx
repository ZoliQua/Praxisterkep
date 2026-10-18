// How the outcome numbers are made — one heading per source and one for the
// statistics, so a reader who doubts a figure on the analysis page can find
// in a minute where it came from and what it cannot say.
import { t } from '../lib/i18n';

const ITEMS = ['mortality', 'whyNotKsh', 'income', 'jobs', 'population', 'stats',
  'grid', 'capital', 'cross', 'limits'] as const;

export function OutcomeMethod() {
  return (
    <section className="section container method" id="kimenetek">
      <h2 className="section__heading">{t('outcomeMethod.heading')}</h2>
      <p className="section__lead">{t('outcomeMethod.lead')}</p>
      {ITEMS.map((k) => (
        <div key={k} className="method__item">
          <h3 className="why__chain-title">{t(`outcomeMethod.${k}.title`)}</h3>
          <p>{t(`outcomeMethod.${k}.text`)}</p>
        </div>
      ))}
    </section>
  );
}
