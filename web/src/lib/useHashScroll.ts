// Scroll to the anchor the address bar names — once the section it names
// actually exists, and again while the page is still growing above it.
//
// The browser does this by itself, but it does it while the page is still an
// empty <div id="root">: every section here arrives after the monthly snapshot
// has been fetched, so a link like /#nalam or /elemzo.html#menetido landed at
// the top of the page and the person had to find the section by hand. That
// made every cross-page link worse than it looked, which is exactly the kind
// of link this site now hands out everywhere.
//
// Arriving once is not enough either: every chart above the target loads its
// own file and pushes it down, so the position is held for a few seconds —
// unless the person scrolls, at which point this stops touching the page.
import { useEffect } from 'react';

/** Clears the sticky top bar; matches the scroll-padding-top in index.css. */
const OFFSET = 76;
const HOLD_MS = 8000;
const EVERY_MS = 120;

function align(id: string): () => void {
  let timer = 0;
  const started = Date.now();
  const stop = () => {
    window.clearInterval(timer);
    window.removeEventListener('wheel', stop);
    window.removeEventListener('touchstart', stop);
    window.removeEventListener('keydown', stop);
  };
  // if the person starts reading before the data lands, leave them alone
  window.addEventListener('wheel', stop, { passive: true });
  window.addEventListener('touchstart', stop, { passive: true });
  window.addEventListener('keydown', stop);

  timer = window.setInterval(() => {
    if (Date.now() - started > HOLD_MS) {
      stop();
      return;
    }
    const el = document.getElementById(id);
    if (!el) return;
    const top = Math.max(0, el.getBoundingClientRect().top + window.scrollY - OFFSET);
    // 'auto' on purpose: the stylesheet asks for smooth scrolling, which would
    // fight a correction arriving every tick
    if (Math.abs(top - window.scrollY) > 2) window.scrollTo({ top, behavior: 'auto' });
  }, EVERY_MS);

  return stop;
}

export function useHashScroll() {
  useEffect(() => {
    const idOf = () => decodeURIComponent(window.location.hash.slice(1));
    let cancel = idOf() ? align(idOf()) : () => {};
    // a click on the page's own table of contents is the same problem in
    // miniature: the section below may still be loading
    const onHash = () => {
      cancel();
      const id = idOf();
      if (id) cancel = align(id);
    };
    window.addEventListener('hashchange', onHash);
    return () => {
      cancel();
      window.removeEventListener('hashchange', onHash);
    };
  }, []);
}
