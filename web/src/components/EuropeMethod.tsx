// How the European comparison is made (modszertan.html#europa-modszer): the
// two publishers, the one-source rule, the concepts kept apart, and what a
// comparison of nine or twenty-eight countries cannot say.
import { t } from '../lib/i18n';
import { EUROPE_METHOD_ITEMS } from '../lib/methodSections';

export function EuropeMethod() {
  return (
    <section className="section container method" id="europa-modszer">
      <h2 className="section__heading">{t('europe.method.heading')}</h2>
      <p className="section__lead">{t('europe.method.lead')}</p>
      {EUROPE_METHOD_ITEMS.map((k) => (
        <div key={k} className="method__item" id={`e-${k}`}>
          <h3 className="why__chain-title">{t(`europe.method.${k}.title`)}</h3>
          <p>{t(`europe.method.${k}.text`)}</p>
        </div>
      ))}
    </section>
  );
}
