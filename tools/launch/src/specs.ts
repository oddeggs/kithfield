import { type Language } from '@kithfield/i18n';

import { type Size, type SlotId } from './limits';

/**
 * Every still exported from a board of `13 Launch`: which frame and box it is cut from, how many
 * panels the box splits into, the exact pixel size of each, and the store slot it fills. The
 * board's boxes are found in document order inside the frame (see `listBoxes`).
 */
export interface BoardJob {
  readonly id: string;
  /** The frame's screen id. */
  readonly frame: string;
  readonly box: number;
  /** The box's CSS size on the board; the bake stops if the board changed. */
  readonly css: Size;
  readonly slices: number;
  readonly size: Size;
  readonly slot: SlotId;
  readonly language: Language;
  /** One path per slice, under `store/`. */
  readonly files: readonly string[];
  /** The render to compare with when it isn't the job's own frame (a set the board shows in another language or time). */
  readonly reference?: { readonly frame: string; readonly box: number };
}

const numbered = (dir: string, n: number, ext = 'png'): string[] =>
  Array.from({ length: n }, (_, i) => `${dir}/${String(i + 1).padStart(2, '0')}.${ext}`);

/** The six-frame panorama for one phone size, by day and at night, in both languages. */
function phoneSets(slot: 'iphone69' | 'iphone65', size: Size, dir: string): BoardJob[] {
  return (['en', 'vi'] as const).flatMap((language): BoardJob[] => [
    {
      id: `ios.${language}.${dir}`,
      frame: '13-02',
      box: 0,
      css: [2040, 737],
      slices: 6,
      size,
      slot,
      language,
      files: numbered(`ios/${language}/${dir}`, 6),
      ...(language === 'vi' ? { reference: { frame: '13-04', box: 0 } } : {}),
    },
    {
      id: `ios.${language}.${dir}-night`,
      frame: '13-03',
      box: 0,
      css: [1020, 368],
      slices: 6,
      size,
      slot,
      language,
      files: numbered(`ios/${language}/${dir}-night`, 6),
    },
  ]);
}

const CPP_AUDIENCES = ['quiet', 'miles', 'stickers', 'teams'] as const;
const EVENTS = ['autumn-fair', 'first-frost', 'birthday-blooms'] as const;

export const BOARD_JOBS: readonly BoardJob[] = [
  ...phoneSets('iphone69', [1320, 2868], 'iphone-6.9'),
  ...phoneSets('iphone65', [1284, 2778], 'iphone-6.5'),
  ...(['en', 'vi'] as const).map((language): BoardJob => ({
    id: `ios.${language}.ipad-13`,
    frame: '13-05',
    box: 0,
    css: [1440, 360],
    slices: 3,
    size: [2752, 2064],
    slot: 'ipad13',
    language,
    files: numbered(`ios/${language}/ipad-13`, 3),
  })),
  ...(['en', 'vi'] as const).flatMap((language): BoardJob[] => [
    {
      id: `android.${language}.phone`,
      frame: '13-06',
      box: 1,
      css: [1530, 510],
      slices: 6,
      size: [1080, 2160],
      slot: 'playPhone',
      language,
      files: numbered(`android/${language}/phone`, 6),
    },
    {
      id: `android.${language}.feature-graphic`,
      frame: '13-06',
      box: 0,
      css: [512, 250],
      slices: 1,
      size: [1024, 500],
      slot: 'playFeature',
      language,
      files: [`android/${language}/feature-graphic.png`],
    },
  ]),
  ...EVENTS.flatMap((event, i): BoardJob[] => [
    {
      id: `ios.en.in-app-events.${event}.card`,
      frame: '13-20',
      box: i * 2,
      css: [384, 216],
      slices: 1,
      size: [1920, 1080],
      slot: 'inAppEventCard',
      language: 'en',
      files: [`ios/en/in-app-events/${event}-card.png`],
    },
    {
      id: `ios.en.in-app-events.${event}.detail`,
      frame: '13-20',
      box: i * 2 + 1,
      css: [122, 216],
      slices: 1,
      size: [1080, 1920],
      slot: 'inAppEventDetail',
      language: 'en',
      files: [`ios/en/in-app-events/${event}-detail.png`],
    },
  ]),
  ...CPP_AUDIENCES.flatMap((audience, a): BoardJob[] =>
    [0, 1, 2, 3].map((n) => ({
      id: `ios.en.product-pages.${audience}.${n + 1}`,
      frame: '13-21',
      box: a * 4 + n,
      css: n === 0 ? [300, 650] : [140, 303],
      slices: 1,
      size: [1320, 2868],
      slot: 'iphone69',
      language: 'en',
      files: [`ios/en/product-pages/${audience}/0${n + 1}.png`],
    })),
  ),
  ...[0, 1, 2, 3, 4, 5].map((n): BoardJob => ({
    id: `marketing.launch-film.${n + 1}`,
    frame: '13-22',
    box: n,
    css: [240, 135],
    slices: 1,
    size: [1920, 1080],
    slot: 'social',
    language: 'en',
    files: [`marketing/launch-film/storyboard-0${n + 1}.png`],
  })),
  ...[0, 1, 2, 3, 4].map((n): BoardJob => ({
    id: `marketing.product-hunt.${n + 1}`,
    frame: '13-24',
    box: n,
    css: [254, 152],
    slices: 1,
    size: [1270, 760],
    slot: 'social',
    language: 'en',
    files: [`marketing/product-hunt/0${n + 1}.png`],
  })),
  ...[0, 1, 2, 3, 4, 5].map((n): BoardJob => ({
    id: `marketing.x-threads.${n + 1}`,
    frame: '13-25',
    box: n,
    css: [300, 169],
    slices: 1,
    size: [1600, 900],
    slot: 'social',
    language: 'en',
    files: [`marketing/x-threads/0${n + 1}.png`],
  })),
  {
    id: 'marketing.sticker-teaser',
    frame: '13-26',
    box: 0,
    css: [270, 338],
    slices: 1,
    size: [1080, 1350],
    slot: 'social',
    language: 'en',
    files: ['marketing/sticker-teaser.png'],
  },
  {
    id: 'marketing.og.homepage',
    frame: '13-27',
    box: 0,
    css: [360, 189],
    slices: 1,
    size: [1200, 630],
    slot: 'social',
    language: 'en',
    files: ['marketing/og/homepage.png'],
  },
  {
    id: 'marketing.og.launch-day',
    frame: '13-27',
    box: 1,
    css: [360, 189],
    slices: 1,
    size: [1200, 630],
    slot: 'social',
    language: 'en',
    files: ['marketing/og/launch-day.png'],
  },
  {
    id: 'marketing.press-hero',
    frame: '13-27',
    box: 2,
    css: [450, 300],
    slices: 1,
    size: [3000, 2000],
    slot: 'social',
    language: 'en',
    files: ['marketing/press-hero.png'],
  },
];

/** A clip rendered frame by frame from a board box's own motion. */
export interface ClipJob {
  readonly id: string;
  readonly frame: string;
  readonly css: Size;
  readonly size: Size;
  readonly slot: SlotId;
  readonly language: Language;
  /** Each shot: a box and how long it holds, in seconds. */
  readonly shots: readonly { readonly box: number; readonly seconds: number }[];
  readonly file: string;
  /** Plays as a loop (no audio track); otherwise a store preview with a silent stereo track. */
  readonly loop: boolean;
}

export const FPS = 30;

/** The App Preview's six shots (`13-18`): 3 + 5 + 5 + 6 + 6 + 5 s, the last trimmed to keep it under 30 s. */
const PREVIEW_SHOTS = [
  { box: 0, seconds: 3 },
  { box: 1, seconds: 5 },
  { box: 2, seconds: 5 },
  { box: 3, seconds: 6 },
  { box: 4, seconds: 6 },
  { box: 5, seconds: 4.9 },
];

/** The six TikTok and Reels loops (`13-23`), each its board's own length. */
const LOOPS = [
  { name: 'otis-dozing', seconds: 6 },
  { name: 'firefly-door', seconds: 5 },
  { name: 'campfire', seconds: 6 },
  { name: 'widget-windows', seconds: 5 },
  { name: 'sticker-peel', seconds: 4 },
  { name: 'farm-draw-in', seconds: 7 },
] as const;

export const CLIP_JOBS: readonly ClipJob[] = [
  ...(['en', 'vi'] as const).map((language): ClipJob => ({
    id: `ios.${language}.app-preview`,
    frame: '13-18',
    css: [150, 325],
    size: [886, 1920],
    slot: 'appPreview69',
    language,
    shots: PREVIEW_SHOTS,
    file: `ios/${language}/app-preview-6.9.mp4`,
    loop: false,
  })),
  ...LOOPS.map(({ name, seconds }, box): ClipJob => ({
    id: `marketing.loops.${name}`,
    frame: '13-23',
    css: [150, 267],
    size: [1080, 1920],
    slot: 'social',
    language: 'en',
    shots: [{ box, seconds }],
    file: `marketing/loops/${name}.mp4`,
    loop: true,
  })),
];
