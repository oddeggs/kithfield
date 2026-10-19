/**
 * The Icon Composer document (`<name>.icon/icon.json`) for the app icon's iOS 26 layers, as
 * `13 Launch` describes them: the painted sky behind everything (with its dark override), the hill
 * and the cottage as one group with a light specular (the hill has a dark override), the window
 * glow with no translucency so it stays the brightest value in clear and tinted, and the critter
 * on top.
 */

type Appearance = 'dark' | 'tinted';

interface Specialized<T> {
  appearance?: Appearance;
  value: T;
}

interface IconLayer {
  name: string;
  'image-name': string;
  'hidden-specializations'?: Specialized<boolean>[];
}

interface IconGroup {
  name: string;
  layers: IconLayer[];
  shadow: { kind: 'neutral' | 'none'; opacity: number };
  translucency: { enabled: boolean; value: number };
  specular?: boolean;
}

export interface IconDocument {
  'fill-specializations': Specialized<{ solid: string }>[];
  groups: IconGroup[];
  'supported-platforms': { circles: string[]; squares: 'shared' };
}

/** `#RRGGBB` as Icon Composer writes a colour. */
export function iconColor(hex: string): string {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  const channel = (shift: number) => (((n >> shift) & 0xff) / 255).toFixed(5);
  return `extended-srgb:${channel(16)},${channel(8)},${channel(0)},1.00000`;
}

/** A layer shown by day (and tinted), and its dark twin shown only in dark mode. */
function withDark(name: string): IconLayer[] {
  return [
    {
      name,
      'image-name': `${name}.png`,
      'hidden-specializations': [{ value: false }, { appearance: 'dark', value: true }],
    },
    {
      name: `${name}-dark`,
      'image-name': `${name}-dark.png`,
      'hidden-specializations': [{ value: true }, { appearance: 'dark', value: false }],
    },
  ];
}

const layer = (name: string): IconLayer => ({ name, 'image-name': `${name}.png` });

/** The layer images the document names, in the order they are baked. */
export const ICON_LAYERS = [
  'critter',
  'glow',
  'cottage',
  'hill',
  'hill-dark',
  'sky',
  'sky-dark',
] as const;

export type IconLayerName = (typeof ICON_LAYERS)[number];

/**
 * Groups are listed top first. The fill is the dusk sky's middle stop (dark: the dark sky's), so
 * the clear and tinted looks start from the icon's own colour.
 */
export function iconDocument(fill: { day: string; dark: string }): IconDocument {
  return {
    'fill-specializations': [
      { value: { solid: iconColor(fill.day) } },
      { appearance: 'dark', value: { solid: iconColor(fill.dark) } },
    ],
    groups: [
      {
        name: 'critter',
        layers: [layer('critter')],
        shadow: { kind: 'neutral', opacity: 0.5 },
        translucency: { enabled: false, value: 0.5 },
      },
      {
        name: 'glow',
        layers: [layer('glow')],
        shadow: { kind: 'none', opacity: 0.5 },
        translucency: { enabled: false, value: 0 },
        specular: false,
      },
      {
        name: 'cottage and hill',
        layers: [layer('cottage'), ...withDark('hill')],
        shadow: { kind: 'neutral', opacity: 0.35 },
        translucency: { enabled: false, value: 0.5 },
        specular: true,
      },
      {
        name: 'sky',
        layers: withDark('sky'),
        shadow: { kind: 'none', opacity: 0.5 },
        translucency: { enabled: false, value: 0.5 },
        specular: false,
      },
    ],
    'supported-platforms': { circles: [], squares: 'shared' },
  };
}
