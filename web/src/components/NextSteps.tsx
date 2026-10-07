// "Mit nézz meg ezután?" — the hand-off between two questions.
//
// The site answers one question per section, and until now each answer was a
// dead end: the reader had to go back to the menu and guess which page
// continues the thought. These cards name the next question instead, and
// carry the branch and the area along, so the next page opens where this one
// left off.
import { t } from '../lib/i18n';
import { useContextHref } from '../lib/context';

export interface NextStep {
  /** page or anchor; the context is written into it */
  href: string;
  /** i18n key of the question this leads to */
  titleKey: string;
  /** i18n key of one line saying what is there */
  textKey: string;
}

export function NextSteps({ items, headingKey = 'next.heading' }: {
  items: readonly NextStep[];
  headingKey?: string;
}) {
  const href = useContextHref();
  if (!items.length) return null;
  return (
    <nav className="nextsteps" aria-label={t(headingKey)}>
      <h3 className="nextsteps__heading">{t(headingKey)}</h3>
      <div className="nextsteps__cards">
        {items.map((s) => (
          <a key={s.href} className="nextsteps__card" href={href(s.href)}>
            <span className="nextsteps__title">{t(s.titleKey)}</span>
            <span className="nextsteps__text">{t(s.textKey)}</span>
          </a>
        ))}
      </div>
    </nav>
  );
}
