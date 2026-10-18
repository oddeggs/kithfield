import { Species } from '@kithfield/contracts';
import { translator, type Language, type Translate } from '@kithfield/i18n';
import { day, night } from '@kithfield/theme';

export type { Language };

/** English lives at the root, Vietnamese under `/vi`. */
export function pathFor(lang: Language, path: string): string {
  if (lang === 'en') return path;
  return path === '/' ? '/vi' : `/vi${path}`;
}

export function copyFor(lang: Language): Translate {
  return translator(lang);
}

/**
 * The page's faces. Vietnamese swaps the whole stack (Young Serif → Lora, Gaegu → Patrick Hand),
 * as `17 Landing VI` does, because Young Serif and Gaegu have no Vietnamese.
 */
export interface Faces {
  serif: string;
  hand: string;
  system: string;
}

export function facesFor(lang: Language): Faces {
  return lang === 'vi'
    ? {
        serif: "'Lora',Georgia,serif",
        hand: "'Patrick Hand',cursive",
        system: '-apple-system,system-ui',
      }
    : {
        serif: "'Young Serif',Georgia,serif",
        hand: 'Gaegu,cursive',
        system: '-apple-system,system-ui',
      };
}

/** The theme's palette as CSS custom properties (`--kf-paper`, `--kf-night-sky`, …). */
export const themeVariables: string = [
  ...Object.entries(day).map(([name, hex]) => `--kf-${kebab(name)}:${hex}`),
  ...Object.entries(night).map(([name, hex]) => `--kf-night-${kebab(name)}:${hex}`),
].join(';');

function kebab(name: string): string {
  return name.replace(/[A-Z0-9]/g, (c) => `-${c.toLowerCase()}`);
}

export const contacts = {
  hello: 'hello@kithfield.com',
  press: 'press@kithfield.com',
  safety: 'safety@kithfield.com',
} as const;

export const SOURCE_URL = 'https://github.com/oddeggs/kithfield';

/**
 * Where the invite page's buttons go. The stores and the web farm have no address before launch;
 * until they do, the buttons lead to the waitlist.
 */
export const appLinks: {
  readonly appStore: string | null;
  readonly googlePlay: string | null;
  /** The web farm; the invite code is appended. */
  readonly webJoin: string | null;
} = { appStore: null, googlePlay: null, webJoin: null };

/** The sixteen critters in the cast's order. */
export const CAST = Species.options;
export type CastKind = Species;

/** The field guide's tint behind each critter, from `17 Landing`. */
export const CAST_TINT: Record<CastKind, string> = {
  mouse: '#efe3dc',
  rabbit: '#f2e0d4',
  tortoise: '#e3e6cf',
  fox: '#f3dcc8',
  duck: '#f4ecd0',
  bear: '#ecdccb',
  hedgehog: '#efdfca',
  otter: '#e3dcd2',
  frog: '#e2ead0',
  capybara: '#efe0c9',
  cat: '#ece4dc',
  owl: '#efe2c8',
  badger: '#e4e2df',
  mole: '#e6dde4',
  raccoon: '#e3e0dc',
  sheep: '#ece6da',
};
