// HU ⇄ EN, on every page. The choice rides in ?lang= (and is remembered by
// lib/i18n), so a link copied in English opens in English.
import { locale } from '../lib/i18n';

export function LangToggle() {
  function switchLocale() {
    const url = new URL(window.location.href);
    url.searchParams.set('lang', locale === 'hu' ? 'en' : 'hu');
    window.location.href = url.toString();
  }
  return (
    <button type="button" className="topnav__lang" onClick={switchLocale} lang={locale === 'hu' ? 'en' : 'hu'}
      aria-label={locale === 'hu' ? 'Switch to English' : 'Váltás magyarra'}>
      {locale === 'hu' ? 'EN' : 'HU'}
    </button>
  );
}
