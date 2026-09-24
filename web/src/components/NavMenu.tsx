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
  children?: readonly (readonly [string, string])[];
}

export function NavMenu({ entries }: { entries: readonly NavEntry[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const navRef = useRef<HTMLDivElement>(null);

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

  return (
    <div className="topnav__links" ref={navRef}>
      {entries.map((entry) => (
        <div key={entry.href} className="topnav__group"
          onPointerEnter={() => entry.children && setOpen(entry.href)}
          onPointerLeave={() => setOpen((cur) => (cur === entry.href ? null : cur))}>
          <a href={entry.href} onClick={() => setOpen(null)}>
            {t(entry.labelKey)}
            {entry.children && <i className="topnav__caret" aria-hidden="true" />}
          </a>
          {entry.children && (
            <>
              <button className="topnav__toggle" aria-expanded={open === entry.href}
                aria-label={t(entry.labelKey)}
                onClick={() => setOpen((cur) => (cur === entry.href ? null : entry.href))} />
              <div className="topnav__submenu" hidden={open !== entry.href}>
                {entry.children.map(([href, key]) => (
                  <a key={href} href={href} onClick={() => setOpen(null)}>{t(key)}</a>
                ))}
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
