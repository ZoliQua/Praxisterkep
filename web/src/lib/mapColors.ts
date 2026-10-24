// The colours the MapLibre maps paint with. MapLibre takes plain colour
// strings, not CSS variables, so they are read off the page's tokens (the
// theme and the colour scheme, lib/theme.ts) and read again when either
// changes — the maps call this in a useMemo keyed by useThemeTick().
import { interpolateRgbBasis } from 'd3';
import { cssColor, currentTheme } from './theme';

export interface MapColors {
  /** the map's own background, under the county shapes */
  bg: string;
  /** county and járás outlines */
  line: string;
  /** the ring around a point, the page background */
  halo: string;
  /** six steps, low to high vacancy */
  ramp: string[];
  /** vacancy age: < 1 year, 1–5, 5–10, 10+ */
  age: string[];
  vacant: string;
  dissolved: string;
  filled: string;
  approx: string;
  mismatch: string;
  jaras: string;
  budapest: string;
}

/** `tick` only ties a memo to the theme (useThemeTick); the colours come from the page. */
export function mapColors(tick = 0): MapColors {
  void tick;
  const light = currentTheme() === 'light';
  const alert = cssColor('--alert', '#ff7a59');
  const soft = cssColor('--alert-soft', '#ffb454');
  const bad = cssColor('--bad', '#ef6461');
  // the low end sits on the page, the high end is the scheme's vacancy colour
  const low = light ? ['#e9eef4', '#c9d5e1'] : ['#152438', '#3d5a6c'];
  // on paper the vacancy dots (in the full warm colour) must stand off the
  // fill, so the light ramp stops halfway between the two warm colours
  const ramp = interpolateRgbBasis(light
    ? [...low, interpolateRgbBasis(['#ffffff', soft])(0.6), interpolateRgbBasis([soft, alert])(0.45)]
    : [...low, soft, alert]);
  return {
    bg: cssColor('--bg', light ? '#f5f7fa' : '#0b1016'),
    line: cssColor('--line-strong', light ? '#c2ccd8' : '#2a3b52'),
    halo: light ? '#ffffff' : cssColor('--bg', '#0b1016'),
    ramp: [0, 0.2, 0.4, 0.6, 0.8, 1].map((k) => ramp(k)),
    age: [interpolateRgbBasis([soft, light ? '#ffffff' : '#fff3c4'])(0.35), soft, alert, bad],
    vacant: alert,
    dissolved: soft,
    filled: cssColor('--good', '#4fd6c2'),
    approx: cssColor('--approx', '#8b98ab'),
    mismatch: cssColor('--violet-soft', '#b8b0f5'),
    jaras: light ? '#9fb0c4' : '#2f4059',
    budapest: light ? '#8697ad' : '#46597a',
  };
}
