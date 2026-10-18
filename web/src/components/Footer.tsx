// What the site is, who made it, and what it is not.
//
// It sits at the bottom of every page on purpose. A reader who arrives on one
// settlement's page from a search engine sees the same three things as one
// who came through the landing: that every number here comes from data the
// state itself published, that a vacant district is not an unserved one, and
// that this is one dentist's private analysis rather than an official
// register. The last of those is the one that protects both the reader and
// the author, so it stands next to the name rather than in a separate page
// nobody opens.
import { t } from '../lib/i18n';
import sources from '../lib/sources.json';
import { formatMonth } from '../lib/format';
import { useSnapshot } from '../store/useAppStore';

const AUTHOR_URL = 'https://dulzoltan.hu';

export function Footer({ month }: { month?: string }) {
  const snapshot = useSnapshot();
  const asOf = month ?? snapshot?.month;
  return (
    <footer className="footer" id="forrasok">
      <div className="container">
        <p className="footer__lead">{t('footer.publicOnly')}</p>

        <h3>{t('footer.sources')}</h3>
        <p className="footer__note">{t('footer.sourcesNote')}</p>
        {/* every figure on the site, with the place anyone can fetch it from */}
        <ul className="footer__sources">
          {sources.groups.map((g) => (
            <li key={g.key}>
              <strong>{t(`footer.src.${g.key}.title`)}</strong>{' '}
              {g.items.map((item, i) => (
                <span key={item.key}>
                  {i > 0 && <span className="footer__sep"> · </span>}
                  <a href={item.href}
                    rel={item.href.startsWith('/') ? undefined : 'noopener'}>
                    {t(`footer.src.${g.key}.${item.key}`)}
                  </a>
                  {'format' in item && item.format
                    && <span className="footer__format"> {item.format}</span>}
                </span>
              ))}
            </li>
          ))}
        </ul>

        <h3>{t('footer.legal')}</h3>
        <ul className="footer__legal">
          <li>{t('footer.disclaimer')}</li>
          <li>{t('footer.vacantNotUnserved')}</li>
          <li>{t('footer.names')}</li>
          <li>{t('footer.noPersonal')}</li>
          <li>{t('footer.notOfficial')}</li>
          <li>{t('footer.correction')}</li>
        </ul>

        <p className="footer__privacy">
          <a href="/adatkezeles.html">{t('privacy.navLabel')}</a>
          {' · '}
          {/* consent.js finds this and reopens the bar */}
          <a href="#" data-consent-reopen>{t('privacy.reopen')}</a>
        </p>
        <p className="footer__author">
          {t('footer.authorBy')}{' '}
          <a href={AUTHOR_URL} rel="noopener">{t('footer.authorName')}</a>
          {t('footer.authorTitle')}
        </p>
        <p>
          {asOf && <>{t('footer.updated')}: {formatMonth(asOf)} · </>}
          {t('footer.license')}
        </p>
      </div>
    </footer>
  );
}
