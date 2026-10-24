// The light/dark and colour-scheme buttons of the app's top bar: navtools.ts
// builds them (the same code serves the static settlement pages), this only
// hands it a host and the labels.
import { useEffect, useRef } from 'react';
import { t } from '../lib/i18n';
import { PALETTES } from '../lib/theme';
import { mountNavTools, type NavToolLabels } from '../navtools';

export function navToolLabels(tr: (key: string) => string): NavToolLabels {
  return {
    toLight: tr('theme.toLight'),
    toDark: tr('theme.toDark'),
    palette: tr('theme.palette'),
    paletteTitle: tr('theme.paletteTitle'),
    palettes: Object.fromEntries(PALETTES.map((p) => [p.key, {
      name: tr(`theme.palettes.${p.key}.name`), note: tr(`theme.palettes.${p.key}.note`),
    }])),
  };
}

export function NavTools() {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => (host.current ? mountNavTools(host.current, navToolLabels(t)) : undefined), []);
  return <div className="navtools" ref={host} />;
}
