// "Miért fontos az alapellátás?" — holadelej-style deep-explainer block.
// Qualitative public-health context only; the single numeric claim is wired
// to our own sourced snapshot data (rule 2: no invented numbers).
import { t } from '../lib/i18n';
import { formatNumber } from '../lib/format';
import { useAppStore } from '../store/useAppStore';

function IconStethoscope() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M12 6v14a10 10 0 0 0 20 0V6" fill="none" stroke="currentColor"
        strokeWidth="2.5" strokeLinecap="round" />
      <path d="M8 6h6M30 6h6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M22 30v4a9 9 0 0 0 18 0v-4" fill="none" stroke="currentColor"
        strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="40" cy="26" r="4.5" fill="none" stroke="currentColor" strokeWidth="2.5" />
    </svg>
  );
}

function IconChild() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="14" r="7" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <path d="M10 42c1-9 6.5-14 14-14s13 5 14 14" fill="none" stroke="currentColor"
        strokeWidth="2.5" strokeLinecap="round" />
      <path d="M19 12.5c.8-2.6 2.6-4 5-4s4.2 1.4 5 4" fill="none" stroke="currentColor"
        strokeWidth="2" strokeLinecap="round" />
      <path d="M31 32l5 4M17 32l-5 4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function IconTooth() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M15 6c-5 0-8 4-8 9 0 8 4 10 5 17 .6 4.4 1.6 10 4.5 10 2.7 0 2.4-6 4-11 .9-2.9 2.1-2.9 3-2.9s2.1 0 3 2.9c1.6 5 1.3 11 4 11 2.9 0 3.9-5.6 4.5-10 1-7 5-9 5-17 0-5-3-9-8-9-3.5 0-5 2-8.5 2S18.5 6 15 6z"
        fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M17 13c1.5-1.5 4-2 6-1" fill="none" stroke="currentColor"
        strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

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
