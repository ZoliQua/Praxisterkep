import { t } from '../lib/i18n';
import { SITE_URL } from '../lib/site';
import { ReferralBlock } from './ReferralBlock';
import { METHOD_PARAGRAPHS } from '../lib/methodSections';

export function Methodology() {
  // the published address, whatever host the page was opened on: a snippet
  // copied from a preview deployment must still point at the real site
  const snippet = `<iframe src="${SITE_URL}/embed.html?k=dental" width="100%" height="420" style="border:0" loading="lazy" title="Praxistérkép"></iframe>`;
  return (
    <section className="section container method" id="modszertan">
      <h2 className="section__heading">{t('methodology.heading')}</h2>
      {METHOD_PARAGRAPHS.map((k) => (
        <div key={k} className="method__item" id={`m-${k}`}>
          <h3 className="why__chain-title">{t(`methodology.titles.${k}`)}</h3>
          <p>{t(`methodology.${k}`)}</p>
        </div>
      ))}
      <div id="m-referral"><ReferralBlock /></div>
      <h3 className="why__chain-title" id="m-embed">{t('methodology.embedTitle')}</h3>
      <p>{t('methodology.embedText')}</p>
      <pre className="embed-snippet"><code>{snippet}</code></pre>
    </section>
  );
}
