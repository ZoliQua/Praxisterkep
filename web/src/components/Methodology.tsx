import { t } from '../lib/i18n';

export function Methodology() {
  return (
    <section className="section container method" id="modszertan">
      <h2 className="section__heading">{t('methodology.heading')}</h2>
      {(['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'] as const).map((k) => (
        <p key={k}>{t(`methodology.${k}`)}</p>
      ))}
    </section>
  );
}
