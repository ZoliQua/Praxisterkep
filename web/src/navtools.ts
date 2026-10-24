// The two buttons at the end of the top bar: light / dark, and the colour
// scheme of the charts and maps (a palette icon that opens the list of
// schemes, each drawn as its swatches). Plain DOM, no React, so the same code
// serves the app (components/NavTools.tsx mounts it) and the 3177 static
// settlement pages (built as its own small entry, see vite.config.ts; the
// generator writes the host element with its labels).
import {
  PALETTES, currentPalette, currentTheme, isPalette, setPalette, setTheme, THEME_EVENT,
} from './lib/theme';

export interface NavToolLabels {
  /** the toggle's title in dark mode (it offers light) and in light mode */
  toLight: string;
  toDark: string;
  palette: string;
  paletteTitle: string;
  /** per scheme key: name and one line */
  palettes: Record<string, { name: string; note: string }>;
}

const SVG = 'http://www.w3.org/2000/svg';

const MOON = '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/>';
const SUN = '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6"/>';
const PALETTE = '<path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.8 1.6-1.6 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.7-1.6 1.6-1.6H16a5 5 0 0 0 5-5C21 6.4 17 3 12 3Z"/>'
  + '<circle cx="7.5" cy="11.5" r="1.3" fill="var(--dental)" stroke="none"/>'
  + '<circle cx="10" cy="7.3" r="1.3" fill="var(--alert)" stroke="none"/>'
  + '<circle cx="14.6" cy="7.3" r="1.3" fill="var(--alert-soft)" stroke="none"/>'
  + '<circle cx="17.2" cy="11" r="1.3" fill="var(--gp)" stroke="none"/>';

function icon(paths: string): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.7');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.innerHTML = paths;
  return svg;
}

/** Builds the buttons into `host`; returns a function that takes them down. */
export function mountNavTools(host: HTMLElement, L: NavToolLabels): () => void {
  host.replaceChildren();
  host.classList.add('navtools');

  const themeBtn = document.createElement('button');
  themeBtn.type = 'button';
  themeBtn.className = 'navtools__btn navtools__theme';
  const paintTheme = () => {
    const light = currentTheme() === 'light';
    themeBtn.replaceChildren(icon(light ? MOON : SUN));
    const label = light ? L.toDark : L.toLight;
    themeBtn.title = label;
    themeBtn.setAttribute('aria-label', label);
    themeBtn.setAttribute('aria-pressed', String(light));
  };
  themeBtn.addEventListener('click', () => setTheme(currentTheme() === 'light' ? 'dark' : 'light'));

  const wrap = document.createElement('div');
  wrap.className = 'navtools__palette';
  const palBtn = document.createElement('button');
  palBtn.type = 'button';
  palBtn.className = 'navtools__btn';
  palBtn.title = L.palette;
  palBtn.setAttribute('aria-label', L.palette);
  palBtn.setAttribute('aria-haspopup', 'true');
  palBtn.setAttribute('aria-expanded', 'false');
  palBtn.append(icon(PALETTE));

  const panel = document.createElement('div');
  panel.className = 'navtools__panel';
  panel.setAttribute('role', 'menu');
  panel.setAttribute('aria-label', L.paletteTitle);
  panel.hidden = true;
  const title = document.createElement('p');
  title.className = 'navtools__title';
  title.textContent = L.paletteTitle;
  panel.append(title);
  const items = PALETTES.map((p) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'navtools__item';
    b.setAttribute('role', 'menuitemradio');
    b.dataset.key = p.key;
    const sw = document.createElement('span');
    sw.className = 'navtools__swatches';
    sw.setAttribute('aria-hidden', 'true');
    for (const c of p.swatches) {
      const i = document.createElement('i');
      i.style.background = c;
      sw.append(i);
    }
    const name = document.createElement('span');
    name.className = 'navtools__name';
    name.textContent = L.palettes[p.key]?.name ?? p.key;
    const note = document.createElement('small');
    note.textContent = L.palettes[p.key]?.note ?? '';
    name.append(note);
    b.append(sw, name);
    b.addEventListener('click', () => {
      if (isPalette(p.key)) setPalette(p.key);
    });
    panel.append(b);
    return b;
  });
  const paintPalette = () => {
    const cur = currentPalette();
    for (const b of items) {
      const on = b.dataset.key === cur;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-checked', String(on));
    }
  };

  const setOpen = (open: boolean) => {
    panel.hidden = !open;
    palBtn.setAttribute('aria-expanded', String(open));
  };
  palBtn.addEventListener('click', () => setOpen(panel.hidden === true));
  const outside = (e: Event) => { if (!wrap.contains(e.target as Node)) setOpen(false); };
  const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
  document.addEventListener('pointerdown', outside);
  document.addEventListener('keydown', escape);

  const repaint = () => { paintTheme(); paintPalette(); };
  window.addEventListener(THEME_EVENT, repaint);
  // another tab changed it: follow
  const storage = (e: StorageEvent) => {
    if (e.key === 'theme' && (e.newValue === 'light' || e.newValue === 'dark')) setTheme(e.newValue);
    if (e.key === 'palette' && isPalette(e.newValue)) setPalette(e.newValue);
  };
  window.addEventListener('storage', storage);

  wrap.append(palBtn, panel);
  host.append(themeBtn, wrap);
  repaint();

  return () => {
    document.removeEventListener('pointerdown', outside);
    document.removeEventListener('keydown', escape);
    window.removeEventListener(THEME_EVENT, repaint);
    window.removeEventListener('storage', storage);
    host.replaceChildren();
  };
}

/** The static pages: every [data-navtools] host carries its labels as JSON. */
export function mountStatic() {
  for (const host of document.querySelectorAll<HTMLElement>('[data-navtools]')) {
    try {
      mountNavTools(host, JSON.parse(host.dataset.navtools ?? '{}') as NavToolLabels);
    } catch {
      // a broken label block leaves the bar without the two buttons, nothing else
    }
  }
}
