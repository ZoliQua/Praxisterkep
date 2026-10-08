// The street-level map on a settlement page, loaded only when asked for.
//
// These pages are plain HTML with the numbers baked in, and that is the point
// of them: no JavaScript, nothing to wait for. A street map cannot be drawn
// that way — it needs tiles from a provider and a renderer — so it stays
// behind a button. Until someone presses it, the page is what it was.
//
// The tile style comes from VITE_MAP_STYLE at build time. Without it this
// module does nothing and the generator does not even write the button, so
// the site works exactly as before when no provider is configured.
const STYLE = import.meta.env.VITE_MAP_STYLE as string | undefined;

export interface StreetPoint {
  lat: number;
  lon: number;
  kind: string;
  name: string;
  address?: string;
  approx?: boolean;
}

function payload(root: HTMLElement): StreetPoint[] {
  const tag = root.querySelector('script[type="application/json"]');
  if (!tag?.textContent) return [];
  try {
    return JSON.parse(tag.textContent) as StreetPoint[];
  } catch {
    return [];
  }
}

function start(root: HTMLElement) {
  const button = root.querySelector('button');
  const host = root.querySelector<HTMLElement>('.tp-street__map');
  if (!button || !host || !STYLE) return;
  button.addEventListener('click', () => {
    button.disabled = true;
    button.textContent = button.dataset.loading ?? '…';
    // the container has to have its size before the map is built in it: a
    // hidden box is zero by zero, and MapLibre would settle for its own
    // default and never match the page
    host.hidden = false;
    root.classList.add('is-open');
    void import('./streetmapRender')
      .then((m) => m.render(host, payload(root), STYLE))
      .then(() => { button.hidden = true; })
      .catch(() => {
        host.hidden = true;
        root.classList.remove('is-open');
        button.disabled = false;
        button.textContent = button.dataset.failed ?? button.textContent;
      });
  });
}

document.querySelectorAll<HTMLElement>('[data-streetmap]').forEach(start);
