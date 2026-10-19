import { describe, expect, it } from 'vitest';

import { ICON_LAYERS, iconColor, iconDocument } from './icon-composer';

describe('the Icon Composer document', () => {
  const doc = iconDocument({ day: '#F2C49A', dark: '#6A4352' });

  it('stacks the critter on top, then the glow, the cottage and hill, and the sky', () => {
    expect(doc.groups.map((g) => g.layers.map((l) => l.name))).toEqual([
      ['critter'],
      ['glow'],
      ['cottage', 'hill', 'hill-dark'],
      ['sky', 'sky-dark'],
    ]);
  });

  it('names only layer images that are baked', () => {
    const images = doc.groups.flatMap((g) => g.layers.map((l) => l['image-name']));
    expect(images.sort()).toEqual(ICON_LAYERS.map((name) => `${name}.png`).sort());
  });

  it('keeps the glow opaque so it stays the brightest value in clear and tinted', () => {
    const glow = doc.groups.find((g) => g.name === 'glow');
    expect(glow?.translucency.enabled).toBe(false);
  });

  it('gives the hill and cottage a light specular, and the sky none', () => {
    expect(doc.groups.find((g) => g.name === 'cottage and hill')?.specular).toBe(true);
    expect(doc.groups.find((g) => g.name === 'sky')?.specular).toBe(false);
  });

  it('swaps the sky and hill for their dark twins in dark mode only', () => {
    for (const name of ['sky', 'hill']) {
      const layers = doc.groups.flatMap((g) => g.layers);
      const day = layers.find((l) => l.name === name);
      const dark = layers.find((l) => l.name === `${name}-dark`);
      expect(day?.['hidden-specializations']).toEqual([
        { value: false },
        { appearance: 'dark', value: true },
      ]);
      expect(dark?.['hidden-specializations']).toEqual([
        { value: true },
        { appearance: 'dark', value: false },
      ]);
    }
  });

  it('writes colours as Icon Composer does', () => {
    expect(iconColor('#FFFFFF')).toBe('extended-srgb:1.00000,1.00000,1.00000,1.00000');
    expect(iconColor('#000000')).toBe('extended-srgb:0.00000,0.00000,0.00000,1.00000');
    expect(doc['fill-specializations'][1]).toEqual({
      appearance: 'dark',
      value: { solid: iconColor('#6A4352') },
    });
  });
});
