// The table of contents of a long page, kept in view.
//
// On a wide screen it sits in the left margin with its group headings; on a
// narrow one it shrinks to a column of dots along the left edge — still there,
// still showing where the reader is — and opens into the full list on a tap.
// The section in view is lit, so the menu answers "where am I" as well as
// "where can I go".
import { useEffect, useState } from 'react';
import { t } from '../lib/i18n';

export interface SideGroup { titleKey: string; items: { id: string; labelKey: string }[] }

export function SideNav({ groups, labelKey }: { groups: SideGroup[]; labelKey: string }) {
  const ids = groups.flatMap((g) => g.items.map((i) => i.id));
  const [active, setActive] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  // only the sections on the page: a járás's own parts appear once one is
  // picked, and a menu item pointing at nothing is worse than none
  const [present, setPresent] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const watched = groups.flatMap((g) => g.items.map((i) => i.id));
    document.body.classList.add('has-side-nav');
    // The section being read is the last one whose top has passed a line a
    // third of the way down the screen. An observer that lit "the topmost
    // section on screen" failed on the county page, where the first target
    // wraps all the others and the rest are short headings inside it: the
    // wrapper was always on screen and always on top.
    let frame = 0;
    const pick = () => {
      frame = 0;
      const line = window.innerHeight * 0.33;
      let best: string | null = null;
      let top = -Infinity;
      for (const id of watched) {
        const el = document.getElementById(id);
        if (!el) continue;
        const y = el.getBoundingClientRect().top;
        if (y <= line && y > top) { top = y; best = id; }
      }
      // at the very top nothing has passed the line yet: the first one is next
      setActive(best ?? watched.find((id) => document.getElementById(id)) ?? null);
    };
    const onScroll = () => { if (!frame) frame = window.requestAnimationFrame(pick); };
    // sections render after their data arrives: look again until all are there.
    // Re-pick only when the cast of present sections changes — scroll and
    // resize already schedule their own picks, and reading every section's
    // box once a second on an idle page forces a layout nothing needs. The
    // trade: content growing above without a scroll event (a slow image)
    // shifts the line until the next scroll nudge.
    let last = new Set<string>();
    const attach = () => {
      const here = new Set(watched.filter((id) => document.getElementById(id)));
      const changed = here.size !== last.size || ![...here].every((x) => last.has(x));
      if (!changed) return;
      last = here;
      setPresent(here);
      pick();
    };
    attach();
    const timer = window.setInterval(attach, 1000);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) window.cancelAnimationFrame(frame);
      document.body.classList.remove('has-side-nav');
    };
  }, [groups]);

  const shown = groups.map((g) => ({ ...g, items: g.items.filter((i) => present.has(i.id)) }))
    .filter((g) => g.items.length);
  if (!shown.length) return null;
  return (
    <nav className={`side-nav${open ? ' is-open' : ''}`} aria-label={t(labelKey)}>
      <button type="button" className="side-nav__toggle" aria-expanded={open}
        onClick={() => setOpen((o) => !o)}>
        <span className="side-nav__toggle-label">{t(labelKey)}</span>
        <span className="side-nav__dots" aria-hidden="true">
          {ids.filter((id) => present.has(id)).map((id) => <i key={id} className={id === active ? 'is-on' : ''} />)}
        </span>
      </button>
      <div className="side-nav__panel">
        {shown.map((g) => (
          <div key={g.titleKey} className="side-nav__group">
            <p className="side-nav__title">{t(g.titleKey)}</p>
            <ul>
              {g.items.map((i) => (
                <li key={i.id}>
                  <a href={`#${i.id}`} aria-current={i.id === active ? 'location' : undefined}
                    onClick={() => setOpen(false)}>{t(i.labelKey)}</a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}
