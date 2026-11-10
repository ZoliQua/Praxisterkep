import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
// the generator is plain node; vitest runs it as it is
import { darken, themeCss } from '../../scripts/theme-css.mjs';
import palettes from './palettes.json';
import { PALETTES, THEME_BOOT } from './theme';

const web = resolve(__dirname, '..', '..');

describe('theme', () => {
  it('theme.css is what scripts/theme-css.mjs writes', () => {
    expect(readFileSync(resolve(web, 'src', 'theme.css'), 'utf8')).toBe(themeCss());
  });

  it('the picker and palettes.json name the same schemes', () => {
    expect(PALETTES.map((p) => p.key).sort())
      .toEqual(Object.keys(palettes).filter((k) => !k.startsWith('_')).sort());
  });

  it('every page entry applies the stored theme before it paints', () => {
    for (const page of ['index', 'elemzo', 'europa', 'eeszt', 'szakellato', 'modszertan', 'megye', 'jaras', 'adatkezeles', 'media', 'tek-nelkul']) {
      expect(readFileSync(resolve(web, `${page}.html`), 'utf8'), page).toContain(`<script>${THEME_BOOT}</script>`);
    }
  });

  it('the light twins read on white', () => {
    const lum = (hex: string) => {
      const n = parseInt(hex.slice(1), 16);
      const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
      const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => lin(c / 255));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    for (const hex of ['#4fd6c2', '#ffea00', '#fde725', '#ffffff', '#3d87e0']) {
      expect(1.05 / (lum(darken(hex)) + 0.05), hex).toBeGreaterThanOrEqual(4);
    }
  });
});

describe('stylesheets', () => {
  it('no token is defined as itself (a find-and-replace once did that)', () => {
    for (const f of ['src/index.css', 'src/theme.css', 'src/components/story/story.css']) {
      const css = readFileSync(resolve(web, f), 'utf8');
      expect([...css.matchAll(/--([a-z0-9-]+):\s*var\(--\1\)/g)].map((m) => m[0]), f).toEqual([]);
    }
  });
});
