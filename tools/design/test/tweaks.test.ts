import { describe, expect, it } from 'vitest';

import { decodeEntities, parentVariants, readTweaks, tweakVariants } from '../src/tweaks';

const props = {
  season: { editor: 'enum', options: ['spring', 'summer', 'autumn', 'winter'], default: 'spring' },
  night: { editor: 'boolean', default: false },
  motion: { editor: 'boolean', default: true },
  $preview: { width: 400 },
};

function source(json: unknown): string {
  const attr = JSON.stringify(json).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  return `<x-dc></x-dc><script type="text/x-dc" data-dc-script data-props="${attr}">class C {}</script>`;
}

describe('reading tweaks', () => {
  it('decodes attribute entities', () => {
    expect(decodeEntities('&quot;a&quot; &amp; &#39;b&#39; &#x41;')).toBe('"a" & \'b\' A');
  });

  it('reads enum and boolean props and skips $-meta', () => {
    expect(readTweaks(source(props))).toEqual([
      { name: 'season', values: ['spring', 'summer', 'autumn', 'winter'], default: 'spring' },
      { name: 'night', values: [false, true], default: false },
      { name: 'motion', values: [true, false], default: true },
    ]);
  });

  it('finds nothing in a file without props', () => {
    expect(readTweaks('<script type="text/x-dc" data-dc-script>class C {}</script>')).toEqual([]);
    expect(readTweaks(source({}))).toEqual([]);
  });
});

describe('variants', () => {
  const variants = tweakVariants(readTweaks(source(props)));

  it('combines every visual tweak, defaults first, animation tweaks left out', () => {
    expect(variants.map((v) => v.suffix)).toEqual([
      '',
      'night',
      'summer',
      'autumn',
      'winter',
      'summer.night',
      'autumn.night',
      'winter.night',
    ]);
  });

  it('applies the full prop set, keeping untouched tweaks at their default', () => {
    expect(variants.find((v) => v.suffix === 'winter.night')?.props).toEqual({
      season: 'winter',
      night: true,
      motion: true,
    });
  });

  it('names a true-by-default boolean as its negation', () => {
    const [, off] = tweakVariants(readTweaks(source({ motion: props.motion })), []);
    expect(off?.suffix).toBe('no-motion');
  });

  it('compares a combination with the defaults and each single tweak it builds on', () => {
    const combo = variants.find((v) => v.suffix === 'winter.night');
    expect(combo && parentVariants(combo, variants).map((v) => v.suffix)).toEqual(['', 'night', 'winter']);
    const single = variants.find((v) => v.suffix === 'summer');
    expect(single && parentVariants(single, variants).map((v) => v.suffix)).toEqual(['']);
  });
});
