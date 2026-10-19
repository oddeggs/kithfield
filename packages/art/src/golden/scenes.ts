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
  /** The scene draws text, which each platform's font engine rasterises a little differently. */
  text?: boolean;
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
  ...SEASONS.map((season) =>
    scene(`farm-${season}-night`, 'farm', 360, 480, { season, night: true, firefly: true }),
  ),
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
  scene('plant-clover-sleepy-night', 'plant', 120, 120, {
    name: 'clover',
    stage: 5,
    state: 'night',
  }),
  scene('plant-rose-pot-rain', 'plant', 120, 120, {
    name: 'rose',
    stage: 3,
    state: 'rain',
    pot: true,
  }),
  {
    ...scene('sticker-wave', 'sticker', 200, 200, { pose: 'wave', kind: 'rabbit', caption: 'hi!' }),
    text: true,
  },
  {
    ...scene('sticker-miss-vi', 'sticker', 200, 200, {
      pose: 'miss',
      kind: 'rabbit',
      caption: 'nhớ ghê',
      lang: 'vi',
    }),
    text: true,
  },
  scene('invite-fox', 'invite', 393, 244, { kind: 'fox', coat: 'arctic', season: 'autumn' }),
  scene('movein-empty', 'movein', 393, 540, {
    kind: 'duck',
    state: 'empty',
    cast: 'rabbit/////,hedgehog/////,frog/////,sheep/////',
  }),
  scene('icon-tinted', 'icon2', 180, 180, { kind: 'fox', state: 'tinted' }),
  scene('icon-mono', 'icon2', 180, 180, { kind: 'cat', state: 'mono' }),
  { ...scene('evening-en', 'evening', 360, 480, { progress: 0.85 }), text: true },
  { ...scene('evening-vi', 'evening', 360, 480, { progress: 0.85, lang: 'vi' }), text: true },
  scene('widget-night', 'widget', 340, 160, { season: 'winter', lit: 'rabbit,frog,owl' }),
  {
    ...scene('weekpage-en', 'weekpage', 360, 640, {
      items: 'rabbit,hedgehog,frog,sheep',
      caption: 'our week',
    }),
    text: true,
  },
  {
    ...scene('weekpage-vi', 'weekpage', 360, 640, {
      items: 'rabbit,hedgehog,frog,sheep',
      caption: 'tuần của mình',
      lang: 'vi',
    }),
    text: true,
  },
  scene('homewidget-night', 'homewidget', 340, 160, {
    night: true,
    lit: 'rabbit,hedgehog,sheep',
    items: 'lantern:sheep',
  }),
  scene('festfarm-moon', 'festfarm', 360, 640, {
    name: 'trungthu',
    season: 'autumn',
    night: true,
  }),
  scene('build-bridge', 'build', 360, 480, { name: 'bridge', progress: 0.55, season: 'autumn' }),
  scene('lantern-cottage', 'lantern', 360, 480, {
    name: 'cottage',
    kind: 'sheep',
    state: 'lit',
    night: true,
  }),
  scene('lixi-open', 'lixi', 160, 200, { state: 'open' }),
];
