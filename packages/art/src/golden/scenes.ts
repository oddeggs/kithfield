import type { SceneAttrs } from '../art';

/** One fixed, seeded scene drawn by both renderers. */
export interface GoldenScene {
  id: string;
  scene: string;
  width: number;
  height: number;
  dpr: number;
  t: number;
  attrs: SceneAttrs;
}

const CAST = [
  'rabbit',
  'hedgehog',
  'frog',
  'mole',
  'sheep',
  'owl',
  'fox',
  'duck',
  'tortoise',
  'badger',
  'mouse',
  'capybara',
  'raccoon',
  'otter',
  'cat',
  'bear',
];

const PLANTS = [
  'clover',
  'tulip',
  'bluebell',
  'sweetpea',
  'blossom',
  'daffodil',
  'sunflower',
  'lavender',
  'poppy',
  'cornflower',
  'strawberry',
  'chamomile',
  'pumpkin',
  'aster',
  'marigold',
  'apple',
  'chrysanthemum',
  'heather',
  'snowdrop',
  'hellebore',
  'holly',
  'jasmine',
  'cyclamen',
  'camellia',
  'forgetmenot',
  'nasturtium',
  'cosmos',
  'paperwhite',
  'moonflower',
  'rose',
  'plum',
  'persimmon',
  'lemon',
  'fig',
];

const SEASONS = ['spring', 'summer', 'autumn', 'winter'];

const scene = (
  id: string,
  name: string,
  width: number,
  height: number,
  attrs: SceneAttrs = {},
  t = 1.2,
): GoldenScene => ({ id, scene: name, width, height, dpr: 2, t, attrs });

/**
 * The golden set: every critter awake and asleep, the farm by day and night and in each season,
 * the fire, every plant at every stage, plus the scenes that exercise the adapter's harder
 * mappings (shadow, CSS filters, text, unbounded composites).
 */
export const GOLDEN_SCENES: readonly GoldenScene[] = [
  ...CAST.flatMap((kind) => [
    scene(`critter-${kind}-awake`, 'stage', 160, 160, { kind }),
    scene(`critter-${kind}-asleep`, 'stage', 160, 160, { kind, state: 'sleep' }),
  ]),
  ...SEASONS.map((season) => scene(`farm-${season}-day`, 'farm', 360, 480, { season })),
  scene('farm-spring-night', 'farm', 360, 480, { season: 'spring', night: true }),
  scene('farm-winter-night', 'farm', 360, 480, { season: 'winter', night: true, firefly: true }),
  scene('farm-rain', 'farm', 360, 480, { season: 'summer', rain: true }),
  scene('fire-campfire', 'campfire', 360, 480, { season: 'autumn' }),
  scene('fire-small', 'firesmall', 240, 180, { season: 'summer' }),
  scene('fire-room', 'fire2', 360, 480, {
    season: 'autumn',
    items: 'rabbit:talk:laugh,owl:wave,frog:doze,sheep:lantern,hedgehog',
  }),
  scene('plant-seed', 'plant', 120, 120, { name: 'clover', stage: 0 }),
  ...PLANTS.flatMap((name) =>
    [1, 2, 3, 4, 5].map((stage) =>
      scene(`plant-${name}-${stage}`, 'plant', 120, 120, { name, stage }),
    ),
  ),
  scene('plant-moonflower-sleepy-night', 'plant', 120, 120, { name: 'moonflower', stage: 5 }),
  scene('plant-rose-pot-rain', 'plant', 120, 120, {
    name: 'rose',
    stage: 3,
    state: 'rain',
    pot: true,
  }),
  scene('sticker-wave', 'sticker', 200, 200, { pose: 'wave', kind: 'rabbit', caption: 'hi!' }),
  scene('icon-tinted', 'icon2', 180, 180, { kind: 'fox', state: 'tinted' }),
  scene('icon-mono', 'icon2', 180, 180, { kind: 'cat', state: 'mono' }),
  scene('evening-en', 'evening', 360, 480, { progress: 0.85 }),
  scene('evening-vi', 'evening', 360, 480, { progress: 0.85, lang: 'vi' }),
  scene('widget-night', 'widget', 340, 160, { season: 'winter', lit: 'rabbit,frog,owl' }),
];
