// "Miért fontos az alapellátás?" — holadelej-style deep-explainer block.
// Qualitative public-health context only; the single numeric claim is wired
// to our own sourced snapshot data (rule 2: no invented numbers).
import { t } from '../lib/i18n';
import { formatNumber } from '../lib/format';
import { useAppStore } from '../store/useAppStore';
import { IconChild, IconStethoscope, IconTooth } from './icons';

const PILLARS = [
  { key: 'gp', Icon: IconStethoscope },
  { key: 'ped', Icon: IconChild },
  { key: 'dental', Icon: IconTooth },
] as const;

function Chain({ items, broken }: { items: string[]; broken: boolean }) {
  return (
    <div className={`why-chain ${broken ? 'why-chain--broken' : ''}`}>
      {items.map((item, i) => (
        <div className="why-chain__step" key={item}>
          <span className="why-chain__node">{item}</span>
          {i < items.length - 1 && (
            <svg className="why-chain__arrow" viewBox="0 0 32 12" aria-hidden="true">
              {broken && i === 0 ? (
                <>
                  <path d="M2 6h9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <path d="M15 2l-3 8M21 2l-3 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <path d="M23 6h5m0 0-4-3m4 3-4 3" stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round" opacity="0.45" />
                </>
              ) : (
                <path d="M2 6h26m0 0-5-4m5 4-5 4" fill="none" stroke="currentColor"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              )}
            </svg>
          )}
        </div>
      ))}
    </div>
  );
}

export function WhySection() {
  const latest = useAppStore((s) => s.latest);
  const gpPop = latest?.kinds.gp
    ? latest.kinds.gp.national.populationVacant + latest.kinds.gp.national.populationDissolved
    : null;
  const dentalPop = latest?.kinds.dental
    ? latest.kinds.dental.national.populationVacant + latest.kinds.dental.national.populationDissolved
    : null;

  const chainOk = [0, 1, 2, 3].map((i) => t(`why.chainOk.${i}`));
  const chainBroken = [0, 1, 2, 3].map((i) => t(`why.chainBroken.${i}`));

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
      <Chain items={chainOk} broken={false} />
      <Chain items={chainBroken} broken={true} />

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
