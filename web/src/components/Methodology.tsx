import { t } from '../lib/i18n';

export function Methodology() {
  const base = `${window.location.origin}${import.meta.env.BASE_URL}`;
  const snippet = `<iframe src="${base}embed.html?k=dental" width="100%" height="420" style="border:0" loading="lazy" title="Praxistérkép"></iframe>`;
  return (
    <section className="section container method" id="modszertan">
      <h2 className="section__heading">{t('methodology.heading')}</h2>
      {(['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9'] as const).map((k) => (
        <p key={k}>{t(`methodology.${k}`)}</p>
      ))}
      <h3 className="why__chain-title">{t('methodology.embedTitle')}</h3>
      <p>{t('methodology.embedText')}</p>
      <pre className="embed-snippet"><code>{snippet}</code></pre>
    </section>
  );
}
