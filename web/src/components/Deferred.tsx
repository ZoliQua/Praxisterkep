// Render a heavy block only once the reader comes near it.
//
// The long pages (elemzo.html above all) used to mount every section at
// once: each fetched its own data file and drew its own WebGL map, so a visit
// that read the first screen still downloaded some 25 MB of JSON and started
// six maps. A deferred block stands in as an empty box of about its height
// until it is within a screen or two of the viewport, then renders for good.
//
// The anchors the block holds are kept on the stand-in, so the table of
// contents and the side menu still list and reach them. Anything that jumps
// — an address with a #anchor, a click on an in-page link, printing — renders
// every deferred block at once, which is exactly the page as it was before;
// useHashScroll then holds the target in place while the sections fill in.
import {
  useEffect, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject,
} from 'react';

let everything = false;
const listeners = new Set<() => void>();

function revealAll() {
  if (everything) return;
  everything = true;
  listeners.forEach((fn) => fn());
}

// A part of elemzo.html opened at its top (#csoport-…) is not a jump into
// the page: its heading is the first thing on it, and nothing below need wait.
const jumps = () => window.location.hash.length > 1 && !window.location.hash.startsWith('#csoport-');

if (typeof window !== 'undefined') {
  // no observer (an old browser, the test environment): nothing is deferred
  if (typeof IntersectionObserver === 'undefined' || jumps()) {
    everything = true;
  }
  window.addEventListener('hashchange', () => { if (jumps()) revealAll(); });
  window.addEventListener('beforeprint', revealAll);
} else {
  everything = true;
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

// Until the reader first scrolls, only what is actually on screen renders:
// the sections above arrive with their data, so on a fresh load the page is
// short for a moment and every stand-in would look "near". After the first
// scroll the margin applies, and blocks render a little before they show.
let scrolled = false;
const scrollListeners = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('scroll', () => {
    scrolled = true;
    scrollListeners.forEach((fn) => fn());
  }, { once: true, passive: true });
}

function subscribeScroll(fn: () => void) {
  scrollListeners.add(fn);
  return () => { scrollListeners.delete(fn); };
}

/** True once the element is within `margin` of the viewport (never false again). */
export function useNearViewport(margin = '800px'): [RefObject<HTMLDivElement | null>, boolean] {
  const ref = useRef<HTMLDivElement | null>(null);
  const all = useSyncExternalStore(subscribe, () => everything, () => true);
  const moved = useSyncExternalStore(subscribeScroll, () => scrolled, () => false);
  const [near, setNear] = useState(false);
  useEffect(() => {
    if (all || near) return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      const hit = entries.some((e) => e.isIntersecting && (moved
        || (e.boundingClientRect.top < window.innerHeight && e.boundingClientRect.bottom > 0)));
      if (hit) {
        setNear(true);
        io.disconnect();
      }
    }, { rootMargin: `${margin} 0px ${margin} 0px` });
    io.observe(el);
    return () => io.disconnect();
  }, [all, near, margin, moved]);
  return [ref, all || near];
}

export function Deferred({ ids = [], minHeight = 600, eager = false, children }: {
  /** the anchors inside the block, kept reachable while it waits */
  ids?: string[];
  /** the stand-in's height: about the block's own, so the page does not jump */
  minHeight?: number;
  /** render at once (e.g. the URL already points into the block) */
  eager?: boolean;
  children: ReactNode;
}) {
  const [ref, near] = useNearViewport();
  if (near || eager) return <>{children}</>;
  return (
    <div ref={ref} className="deferred" style={{ minHeight }} aria-hidden="true">
      {ids.map((id) => <span key={id} id={id} />)}
    </div>
  );
}
