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
    const seen = new Map<string, number>();
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) seen.set(e.target.id, e.isIntersecting ? e.boundingClientRect.top : Infinity);
      // the topmost section still on screen is the one being read
      let best: string | null = null;
      let top = Infinity;
      for (const id of watched) {
        const v = seen.get(id);
        if (v !== undefined && v !== Infinity && v < top) { top = v; best = id; }
      }
      if (best) setActive(best);
    }, { rootMargin: '-20% 0px -60% 0px' });
    // sections render after their data arrives: look again until all are there
    const attach = () => {
      const here = new Set<string>();
      watched.forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        here.add(id);
        if (!el.dataset.sideObserved) { el.dataset.sideObserved = '1'; io.observe(el); }
      });
      setPresent((old) => (old.size === here.size && [...here].every((x) => old.has(x)) ? old : here));
    };
    attach();
    const timer = window.setInterval(attach, 1000);
    return () => {
      io.disconnect(); window.clearInterval(timer);
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
