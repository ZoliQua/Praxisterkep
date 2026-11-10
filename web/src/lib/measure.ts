// Vercel Speed Insights, behind the same yes as Google Analytics.
//
// The footer and the privacy notice promise that no measuring code loads
// before consent, so this waits for public/consent.js: it marks a granted
// decision on window and announces one given on this page view. A no, or no
// decision yet, loads nothing. The page address goes without its query: the
// county or settlement someone is looking at is not a speed measurement. The
// route is the page file itself, so the dashboard splits the score by page
// instead of filing every visit under "Unknown" (it only knows Next.js routes).
import { injectSpeedInsights } from '@vercel/speed-insights';

declare global {
  interface Window { praxisterkepConsent?: string }
}

let started = false;
function start() {
  if (started) return;
  started = true;
  injectSpeedInsights({
    route: window.location.pathname,
    beforeSend: (event) => ({ ...event, url: event.url.split(/[?#]/)[0] }),
  });
}

if (typeof window !== 'undefined') {
  if (window.praxisterkepConsent === 'granted') start();
  else window.addEventListener('praxisterkep:consent', start, { once: true });
}
