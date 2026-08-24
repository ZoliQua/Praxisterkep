// "Miért fontos az alapellátás?" — holadelej-style deep-explainer block.
// Qualitative public-health context only; the single numeric claim is wired
// to our own sourced snapshot data (rule 2: no invented numbers).
import { t } from '../lib/i18n';
import { formatNumber } from '../lib/format';
import { useAppStore } from '../store/useAppStore';
import { IconChild, IconStethoscope, IconTooth } from './icons';
import { PreventionStory } from './PreventionStory';

const PILLARS = [
  { key: 'gp', Icon: IconStethoscope },
  { key: 'ped', Icon: IconChild },
  { key: 'dental', Icon: IconTooth },
] as const;

export function WhySection() {
  const latest = useAppStore((s) => s.latest);
  const gpPop = latest?.kinds.gp
    ? latest.kinds.gp.national.populationVacant + latest.kinds.gp.national.populationDissolved
    : null;
  const dentalPop = latest?.kinds.dental
    ? latest.kinds.dental.national.populationVacant + latest.kinds.dental.national.populationDissolved
    : null;

  return (
    <section className="section container why" id="alapellatas">
      <h2 className="section__heading">{t('why.heading')}</h2>
      <p className="why__lead">{t('why.lead')}</p>

      <div className="why__pillars">
        {PILLARS.map(({ key, Icon }) => (
          <article className="why-pillar" key={key}>
            <div className="why-pillar__icon"><Icon /></div>
            <h3>{t(`why.${key}.title`)}</h3>
            <p>{t(`why.${key}.text`)}</p>
          </article>
        ))}
      </div>

      <h3 className="why__chain-title">{t('why.chainTitle')}</h3>
      <p className="section__explain">{t('why.chainIntro')}</p>
      <PreventionStory />

      {gpPop !== null && dentalPop !== null && (
        <p className="notice">
          {t('why.dataTie', {
            gpPop: formatNumber(gpPop),
            dentalPop: formatNumber(dentalPop),
          })}
        </p>
      )}
      <p className="why__disclaimer">{t('why.disclaimer')}</p>
    </section>
  );
}
