/**
 * Consent, and Google Analytics behind it.
 *
 * This is a hand-written file in public/, not a bundled module, on purpose:
 * the 3177 generated settlement pages carry no JavaScript except the map they
 * load on a click, and they are the pages a search engine sends people to. One
 * script that every page includes is the only way the banner and the measuring
 * can behave identically on all 3182 of them without pulling a bundle into the
 * static pages.
 *
 * The rules it keeps:
 *
 *  - Nothing is measured before a yes. Analytics storage is denied in the
 *    consent default, so even the loader cannot write a cookie first and ask
 *    afterwards.
 *  - A no is remembered and is as easy to give as a yes. The two buttons are
 *    the same size and neither is pre-selected.
 *  - A decision can be changed: the footer's link reopens the banner.
 *  - With no measurement id configured, nothing loads and no banner appears.
 *    The site keeps working exactly as it did.
 *
 * The id comes from <meta name="ga-id">, which Vite fills from VITE_GA_ID in
 * the built pages and the generator writes into the static ones.
 */
(function () {
  'use strict';

  var KEY = 'praxisterkep.consent';
  var GRANTED = 'granted';
  var DENIED = 'denied';

  var meta = document.querySelector('meta[name="ga-id"]');
  var id = meta ? (meta.getAttribute('content') || '').trim() : '';
  // an unreplaced Vite placeholder means the variable is simply not set
  if (!id || id.charAt(0) === '%') return;

  var lang = (document.documentElement.lang || 'hu').slice(0, 2);
  var T = {
    hu: {
      text: 'Szeretnénk mérni, hányan és milyen oldalakat néznek — ehhez a '
        + 'Google Analytics sütit használ. Csak akkor indul el, ha elfogadod. '
        + 'Az oldal enélkül is teljesen működik.',
      accept: 'Elfogadom',
      deny: 'Nem kérem',
      more: 'Adatkezelési tájékoztató',
      reopen: 'Sütibeállítás',
    },
    en: {
      text: 'We would like to measure how many people read which pages, which '
        + 'Google Analytics does with a cookie. It only starts if you accept. '
        + 'The site works fully without it.',
      accept: 'Accept',
      deny: 'No thanks',
      more: 'Privacy notice',
      reopen: 'Cookie settings',
    },
  };
  var t = T[lang] || T.hu;
  var NOTICE = '/adatkezeles.html';

  function read() {
    try {
      return localStorage.getItem(KEY);
    } catch (e) {
      return null; // private window, blocked storage: treat as undecided
    }
  }

  function write(value) {
    try {
      localStorage.setItem(KEY, value);
    } catch (e) {
      /* nothing to do: the choice holds for this page view only */
    }
  }

  // The consent default runs before any Google tag, so the tag cannot store
  // anything until the state is updated to granted.
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = window.gtag || gtag;
  gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied',
    wait_for_update: 500,
  });

  var loaded = false;
  function loadAnalytics() {
    if (loaded) return;
    loaded = true;
    gtag('consent', 'update', { analytics_storage: 'granted' });
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id);
    document.head.appendChild(s);
    gtag('js', new Date());
    // no cross-site advertising signals, and the address is enough: the page
    // path is what this site wants to know, not who is reading it
    gtag('config', id, {
      anonymize_ip: true,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
    });
  }

  function dismiss(box) {
    if (box && box.parentNode) box.parentNode.removeChild(box);
  }

  function banner() {
    if (document.getElementById('consent-bar')) return;
    var box = document.createElement('div');
    box.id = 'consent-bar';
    box.className = 'consent';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-live', 'polite');

    var p = document.createElement('p');
    p.className = 'consent__text';
    p.appendChild(document.createTextNode(t.text + ' '));
    var a = document.createElement('a');
    a.href = NOTICE;
    a.textContent = t.more;
    p.appendChild(a);

    var row = document.createElement('div');
    row.className = 'consent__buttons';
    var no = document.createElement('button');
    no.type = 'button';
    no.className = 'consent__button';
    no.textContent = t.deny;
    no.onclick = function () { write(DENIED); dismiss(box); };
    var yes = document.createElement('button');
    yes.type = 'button';
    yes.className = 'consent__button consent__button--yes';
    yes.textContent = t.accept;
    yes.onclick = function () { write(GRANTED); dismiss(box); loadAnalytics(); };
    row.appendChild(no);
    row.appendChild(yes);

    box.appendChild(p);
    box.appendChild(row);
    document.body.appendChild(box);
  }

  // the footer link that lets a decision be taken back
  function wireReopen() {
    var links = document.querySelectorAll('[data-consent-reopen]');
    for (var i = 0; i < links.length; i += 1) {
      links[i].textContent = t.reopen;
      links[i].addEventListener('click', function (e) {
        e.preventDefault();
        try { localStorage.removeItem(KEY); } catch (err) { /* ignore */ }
        banner();
      });
    }
  }

  function start() {
    var state = read();
    if (state === GRANTED) loadAnalytics();
    else if (state !== DENIED) banner();
    wireReopen();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
}());
