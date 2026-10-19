/**
 * The stores' rules for each kind of asset: the pixel sizes a slot accepts, file size caps and
 * the listing's character limits. Every baked file is checked against its slot.
 */

export type Size = readonly [width: number, height: number];

export interface Slot {
  /** Where it goes, as the store names it. */
  readonly name: string;
  /** Exact sizes the slot accepts; either orientation unless `portraitOnly`. */
  readonly sizes?: readonly Size[];
  /** Or a minimum on each side. */
  readonly min?: Size;
  /** Longest side over shortest, at most. */
  readonly maxAspect?: number;
  readonly maxBytes?: number;
  /** The store refuses images with an alpha channel. */
  readonly opaque: boolean;
  /** How many one locale may have. */
  readonly perLocale?: number;
}

const MB = 1024 * 1024;

export const SLOTS = {
  iphone69: {
    name: 'App Store · iPhone 6.9" screenshots',
    sizes: [
      [1320, 2868],
      [1290, 2796],
      [1260, 2736],
    ],
    opaque: true,
    perLocale: 10,
  },
  iphone65: {
    name: 'App Store · iPhone 6.5" screenshots',
    sizes: [
      [1284, 2778],
      [1242, 2688],
    ],
    opaque: true,
    perLocale: 10,
  },
  ipad13: {
    name: 'App Store · iPad 13" screenshots',
    sizes: [
      [2064, 2752],
      [2048, 2732],
    ],
    opaque: true,
    perLocale: 10,
  },
  appPreview69: {
    name: 'App Store · App Preview, iPhone 6.9"',
    sizes: [[886, 1920]],
    maxBytes: 500 * MB,
    opaque: true,
    perLocale: 3,
  },
  inAppEventCard: {
    name: 'App Store · In-App Event card',
    sizes: [[1920, 1080]],
    opaque: true,
  },
  inAppEventDetail: {
    name: 'App Store · In-App Event details page',
    sizes: [[1080, 1920]],
    opaque: true,
  },
  iapReview: {
    name: 'App Store · in-app purchase review screenshot',
    min: [640, 920],
    opaque: true,
  },
  playPhone: {
    name: 'Google Play · phone screenshots',
    min: [320, 320],
    maxAspect: 2,
    maxBytes: 8 * MB,
    opaque: true,
    perLocale: 8,
  },
  playFeature: {
    name: 'Google Play · feature graphic',
    sizes: [[1024, 500]],
    maxBytes: 15 * MB,
    opaque: true,
  },
  playIcon: {
    name: 'Google Play · app icon',
    sizes: [[512, 512]],
    maxBytes: 1024 * 1024,
    opaque: false,
  },
  appIcon: {
    name: 'App Store · app icon',
    sizes: [[1024, 1024]],
    opaque: true,
  },
  social: {
    name: 'Launch kit',
    min: [1, 1],
    opaque: true,
  },
} as const satisfies Record<string, Slot>;

export type SlotId = keyof typeof SLOTS;

/** Whether a width × height fits a slot; the reason when it doesn't. */
export function fitsSlot(slot: Slot, [w, h]: Size): string | null {
  if (slot.sizes) {
    const ok = slot.sizes.some(([a, b]) => (a === w && b === h) || (a === h && b === w));
    return ok
      ? null
      : `${w}×${h} is not one of ${slot.sizes.map(([a, b]) => `${a}×${b}`).join(', ')}`;
  }
  if (
    slot.min &&
    (Math.min(w, h) < Math.min(...slot.min) || Math.max(w, h) < Math.max(...slot.min))
  ) {
    return `${w}×${h} is under ${slot.min[0]}×${slot.min[1]}`;
  }
  if (slot.maxAspect && Math.max(w, h) / Math.min(w, h) > slot.maxAspect + 1e-9) {
    return `${w}×${h} is longer than ${slot.maxAspect}:1`;
  }
  return null;
}

/** The listing's fields and their character limits, per store. */
export const TEXT_LIMITS = {
  appStore: {
    name: 30,
    subtitle: 30,
    promotionalText: 170,
    keywords: 100,
    description: 4000,
    whatsNew: 4000,
  },
  play: { title: 30, shortDescription: 80, fullDescription: 4000 },
  inAppEvent: { name: 30, shortDescription: 50, longDescription: 120 },
} as const;
