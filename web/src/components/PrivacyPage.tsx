// "Adatkezelési tájékoztató" (adatkezeles.html).
//
// The site measures almost nothing, which is exactly why this page is short
// and concrete rather than a wall of boilerplate: a reader should be able to
// see in one screen what is stored, by whom, for how long, and how to say no.
// Everything on it is a statement of fact about the code — the consent
// default, the lack of trackers, what localStorage holds — so it has to be
// checked against the code whenever either changes.
import { t } from '../lib/i18n';
import { PageNav } from './PageNav';
import { Footer } from './Footer';
import { useHashScroll } from '../lib/useHashScroll';

const SECTIONS = [
  'controller', 'what', 'analytics', 'legalBasis', 'retention', 'processors',
  'storage', 'rights', 'sources', 'change',
] as const;

export function PrivacyPage() {
  useHashScroll();
  return (
    <>
      <PageNav />
      <section className="section container" id="adatkezeles">
        <h1 className="section__heading">{t('privacy.heading')}</h1>
        <p className="section__lead">{t('privacy.lead')}</p>
        <p className="section__explain">{t('privacy.updated')}</p>

        {SECTIONS.map((key) => (
          <div key={key} className="privacy__block">
            <h2 className="section__subheading">{t(`privacy.${key}.title`)}</h2>
            <p>{t(`privacy.${key}.text`)}</p>
          </div>
        ))}

        <p className="privacy__consent">
          {t('privacy.changeMind')}{' '}
          {/* consent.js finds this by the attribute and reopens the banner */}
          <a href="#" data-consent-reopen>{t('privacy.reopen')}</a>
        </p>
      </section>
      <Footer />
    </>
  );
}
