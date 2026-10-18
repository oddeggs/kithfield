import { describe, expect, it } from 'vitest';

import { glass, layout, pill, press, radii, shadows, sizes, spacing } from './space';
import { between, captures, foundations, num, one, textOf } from './test/design';

const html = foundations();
const section = between(html, 'id="space"', 'id="motion"');
const [spacingHtml = '', radiiHtml = ''] = section.split('>Radii<');
const spacingText = textOf(spacingHtml);
const components = between(html, 'id="components"', 'id="glossary"');
const componentText = textOf(components);
const notes = textOf(between(html, 'id="dev-notes"', '</main>'));

/** The design's radius captions, mapped to token keys. A new caption fails the lookup. */
const RADIUS_KEYS: Record<string, keyof typeof radii> = {
  'Bubble tail': 'bubbleTail',
  'Chips (small), tiles': 'tile',
  Fields: 'field',
  Cards: 'card',
  'Buttons (pill = height / 2)': 'button',
  Sheets: 'sheet',
  'Inset sheets': 'insetSheet',
  Device: 'device',
};

describe('spacing and radii match 01 Foundations', () => {
  it('has the spacing scale', () => {
    const scale = captures(spacingHtml, /<span style="width:36px;[^"]*">(\d+)<\/span>/g).map(
      ([n = '']) => num(n),
    );
    expect(spacing).toEqual(scale);
  });

  it('has the screen margins, card gaps and hit target', () => {
    const [list, title, button, bottom] = one(
      spacingText,
      /Screen margins (\d+) \(lists\), (\d+) \(titles\), (\d+) \(bottom buttons, (\d+) from the bottom\)/,
    ).map(num);
    const [gapMin, gapMax] = one(spacingText, /Gaps between stacked cards (\d+)–(\d+)/).map(num);
    const [hit] = one(spacingText, /Hit targets never below (\d+)/).map(num);
    expect(layout).toMatchObject({
      marginList: list,
      marginTitle: title,
      marginButton: button,
      buttonBottom: bottom,
      cardGapMin: gapMin,
      cardGapMax: gapMax,
      minHitTarget: hit,
    });
  });

  it('has every radius by its caption', () => {
    const rows = captures(
      radiiHtml,
      /<div style="font:600 12px\/1\.2 -apple-system,system-ui">(\d+)<\/div>\s*<div style="font:12px\/1\.3[^"]*">([^<]+)<\/div>/g,
    );
    const design = Object.fromEntries(
      rows.map(([value = '', caption = '']) => {
        const key = RADIUS_KEYS[caption];
        if (!key) throw new Error(`new radius in the design: ${caption}`);
        return [key, num(value)];
      }),
    );
    expect(radii).toEqual(design);
    expect(pill(56)).toBe(28);
  });
});

describe('component sizes match 01 Foundations', () => {
  it('has the button, circle, tab bar and sheet sizes', () => {
    const [large, medium, small, circle] = one(
      componentText,
      /Heights (\d+) \/ (\d+) \/ (\d+); circles (\d+)/,
    ).map(num);
    const [tabBar] = one(componentText, /Floating glass tab bar, (\d+) tall/).map(num);
    const [sheetRadius, sheetPadding] = one(
      componentText,
      /Standard sheet over art: (\d+) radius, grabber, (\d+) side padding/,
    ).map(num);
    expect(sizes).toMatchObject({
      buttonLarge: large,
      buttonMedium: medium,
      buttonSmall: small,
      circle,
      tabBar,
    });
    expect(radii.sheet).toBe(sheetRadius);
    expect(layout.sheetPadding).toBe(sheetPadding);
    expect(components).toContain(
      `width:${sizes.grabberWidth}px;height:${sizes.grabberHeight}px;border-radius:3px`,
    );
    expect(components).toContain(`height:${sizes.chip}px;padding:0 13px;border-radius:17px`);
  });

  it('has the press state', () => {
    const [scale, darken, ms] = one(
      notes,
      /Press state: scale ([\d.]+) and (\d+)% darker, (\d+)ms/,
    );
    expect(press).toEqual({
      scale: num(scale ?? ''),
      darken: num(darken ?? '') / 100,
      durationMs: num(ms ?? ''),
    });
  });

  it('draws every shadow as the component library does', () => {
    for (const shadow of Object.values(shadows))
      expect(components).toContain(`box-shadow:${shadow}`);
  });

  it('draws every glass surface as the component library does', () => {
    for (const g of Object.values(glass)) {
      const filter =
        g.saturate === 1 ? `blur(${g.blur}px)` : `blur(${g.blur}px) saturate(${g.saturate})`;
      expect(components).toContain(`background:${g.fill};backdrop-filter:${filter};`);
      expect(components).toContain(
        `backdrop-filter:${filter};-webkit-backdrop-filter:${filter};border:1px solid ${g.border}`,
      );
    }
  });
});
