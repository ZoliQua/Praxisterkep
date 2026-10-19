// The top bar, grouped. Ten flat links had stopped fitting on a laptop and
// were scrolling sideways; now six entries carry their sections in a
// dropdown. A group whose label is itself a destination stays clickable —
// "Térkép" goes to the map whether or not you open its submenu.
import { useEffect, useRef, useState } from 'react';
import { t } from '../lib/i18n';

export interface NavEntry {
  /** href of the group itself: an anchor on this page or another page */
  href: string;
  labelKey: string;
  /** [href, labelKey] links; a third element "group" makes the row a
   *  heading of the links under it (the analysis page's 22 sections) */
  children?: readonly (readonly [string, string] | readonly [string, string, string])[];
}

type Child = NonNullable<NavEntry['children']>[number];

/** Split a submenu at its group headings; an ungrouped one is one column. */
function columns(children: readonly Child[]): Child[][] {
  const out: Child[][] = [];
  for (const c of children) {
    if (c[2] === 'group' || !out.length) out.push([]);
    out[out.length - 1].push(c);
  }
  return out;
}

export function NavMenu({ entries }: { entries: readonly NavEntry[] }) {
  const [open, setOpen] = useState<string | null>(null);
  // on a phone the whole bar folds behind one button (the CSS shows it there)
  const [folded, setFolded] = useState(true);
  const navRef = useRef<HTMLDivElement>(null);
  // The bar wraps to two rows on a phone and grows further with the folded
  // menu open; whatever sticks below it reads its real height. The measure
  // lives here so every render path — the landing, the standalone pages —
  // gets it. The generated settlement pages run no React; their inline
  // script in web/scripts/settlement-pages.mjs does the same, keep them in
  // step.
  useEffect(() => {
    const el = navRef.current?.closest('nav');
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const set = () => document.documentElement.style.setProperty('--topnav-h', `${el.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // The caret only ever opens. A toggle reads well on paper and fails in the
  // hand: the pointer enters the caret and clicks in one motion, so the hover
  // opens the panel and the click closes it again — the menu looks dead. It
  // closes the three ways a menu should: the pointer leaves, Escape, or a
  // click anywhere outside.
  const show = (href: string) => setOpen(href);

  useEffect(() => {
    if (open === null) return undefined;
    const close = (event: Event) => {
      if (!navRef.current?.contains(event.target as Node)) setOpen(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(null);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  const done = () => { setOpen(null); setFolded(true); };

  return (
    <>
    <button type="button" className="topnav__menu" aria-expanded={!folded}
      aria-controls="topnav-links" onClick={() => setFolded((f) => !f)}>
      <i aria-hidden="true" /><span className="topnav__menu-label">{t('nav.menu')}</span>
    </button>
    {/* one nav per page: the button's aria-controls and the CSS sibling
        selector both assume this id is unique on the page */}
    <div className={`topnav__links${folded ? '' : ' is-open'}`} id="topnav-links" ref={navRef}>
      {entries.map((entry) => (
        <div key={entry.href} className="topnav__group"
          // hover opens it for a mouse only: on a touch screen the tap would
          // open the panel and the click that follows would close it again
          onPointerEnter={(event) => {
            if (event.pointerType === 'mouse' && entry.children) show(entry.href);
          }}
          onPointerLeave={(event) => {
            if (event.pointerType === 'mouse') {
              setOpen((cur) => (cur === entry.href ? null : cur));
            }
          }}>
          <a href={entry.href} onClick={done}>
            {t(entry.labelKey)}
            {entry.children && <i className="topnav__caret" aria-hidden="true" />}
          </a>
          {entry.children && (
            <>
              <button className="topnav__toggle" aria-expanded={open === entry.href}
                aria-label={t(entry.labelKey)}
                onClick={() => show(entry.href)} />
              <div className={`topnav__submenu${entry.children.some((c) => c[2] === 'group')
                ? ' is-grouped' : ''}`} hidden={open !== entry.href}>
                {/* a heading and its links stay together in one column */}
                {columns(entry.children).map((col) => (
                  <div key={col[0][0]} className="topnav__subcol">
                    {col.map((c) => (
                      <a key={c[0]} href={c[0]} className={c[2] === 'group' ? 'topnav__subhead' : undefined}
                        onClick={done}>{t(c[1])}</a>
                    ))}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      ))}
    </div>
    </>
  );
}
