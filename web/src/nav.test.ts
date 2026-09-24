// The dropdowns shipped once already looking right and opening into nothing:
// the bar had "overflow-x: auto", which makes overflow-y compute to auto as
// well, so the panel was clipped to the height of the bar. A render test
// cannot see that, hence this one.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// vitest does not process CSS, so the stylesheet is read from disk; the
// comments mention the very properties under test, so they are stripped
const css = readFileSync('src/index.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

function block(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start, `${selector} is missing from index.css`).toBeGreaterThan(-1);
  return css.slice(start, css.indexOf('}', start));
}

describe('the top bar must not clip its dropdowns', () => {
  it.each(['.topnav__inner', '.topnav__links'])('%s has no overflow', (selector) => {
    expect(block(selector)).not.toMatch(/overflow/);
  });

  it('the submenu sits directly under its label', () => {
    // a gap between the two closes the menu as the pointer crosses it
    expect(block('.topnav__submenu')).toMatch(/margin-top: 0/);
  });

  it('the submenu is layered above the bar', () => {
    const zIndex = Number(/z-index: (\d+)/.exec(block('.topnav__submenu'))?.[1]);
    const bar = Number(/z-index: (\d+)/.exec(block('.topnav'))?.[1]);
    expect(zIndex).toBeGreaterThan(bar);
  });
});
