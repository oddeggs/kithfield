import { type FontName } from '@kithfield/theme';

/** google/fonts, pinned: the repository Google Fonts publishes from. */
const GOOGLE_FONTS =
  'https://raw.githubusercontent.com/google/fonts/47d54ca1ebb14fd864695f1d39dc734f39017c33/ofl';

export interface Source {
  /** File name: in `packages/theme/fonts/` when committed, in the work directory when not. */
  file: string;
  /**
   * Where it is downloaded from. Absent for a file the designer hands over (Kithfield Hand),
   * which `download --local <dir>` reads from that directory instead.
   */
  url?: string;
  sha256: string;
}

/**
 * What a hand font keeps, as `pyftsubset` arguments: Basic Latin to Latin Extended-B, spacing
 * modifiers and combining marks, Latin Extended Additional, general punctuation and currency.
 * Hangul and the full-width forms go. Layout features (ccmp, mark, mkmk), the name table and
 * hinting stay.
 */
export const SUBSET_ARGS: readonly string[] = [
  '--unicodes=U+0000-024F,U+02B0-036F,U+1E00-1EFF,U+2000-206F,U+20A0-20CF',
  '--layout-features=*',
  '--name-IDs=*',
  '--name-languages=*',
  '--name-legacy',
  '--glyph-names',
  '--notdef-outline',
  '--legacy-kern',
  '--hinting',
];

/** How a committed font file is made. */
export type Recipe =
  | { kind: 'download'; url: string }
  | {
      kind: 'instance';
      from: Source;
      /** Every axis of `from`, pinned. */
      axes: Readonly<Record<string, number>>;
      /** The family and style it registers under (name IDs 16 and 17, or 1 and 2). */
      family: string;
      style: string;
      weight: number;
    }
  | { kind: 'subset'; from: Source };

export interface FontSource {
  name: FontName;
  /** File name in `packages/theme/fonts/`. */
  file: string;
  /** The SHA-256 of the committed file. */
  sha256: string;
  recipe: Recipe;
}

const FRAUNCES: Source = {
  file: 'Fraunces[SOFT,WONK,opsz,wght].ttf',
  url: `${GOOGLE_FONTS}/fraunces/Fraunces%5BSOFT%2CWONK%2Copsz%2Cwght%5D.ttf`,
  sha256: '177ff6c0f14e5550a3c624247cd1189611d4eb65d000b14944c63d967958abbb',
};

/** Fraunces, fully soft and wonky, semibold, at the optical size `opsz`. */
const fraunces = (name: FontName, opsz: number, sha256: string): FontSource => ({
  name,
  file: `${name}.ttf`,
  sha256,
  recipe: {
    kind: 'instance',
    from: FRAUNCES,
    axes: { opsz, wght: 600, SOFT: 100, WONK: 1 },
    family: `Fraunces ${opsz}pt SuperSoft`,
    style: 'SemiBold',
    weight: 600,
  },
});

/** A font used as google/fonts publishes it. */
const published = (name: FontName, path: string, sha256: string): FontSource => ({
  name,
  file: `${name}.ttf`,
  sha256,
  recipe: { kind: 'download', url: `${GOOGLE_FONTS}/${path}` },
});

/** Every embedded font file, with the SHA-256 of the committed bytes. */
export const fontSources: readonly FontSource[] = [
  fraunces(
    'Fraunces18ptSuperSoft-SemiBold',
    18,
    'acb866506a1fc9db6d44c50c48f5f58a0bef765f3e9863d614ffaf9cb52618ca',
  ),
  fraunces(
    'Fraunces36ptSuperSoft-SemiBold',
    36,
    'c7444cc034d497d2478a8506cfd6f06429bbe549062f6cf338f741ed97c7ab9d',
  ),
  fraunces(
    'Fraunces72ptSuperSoft-SemiBold',
    72,
    'af85bd832a1930f2eaf276c55d6ec84e2210be0e24e529b501402effa7cb8e56',
  ),
  /**
   * The hand face: Gaegu Bold extended with Vietnamese by the designer, subset to Latin and
   * Vietnamese. A new version replaces `from` (its SHA-256) and goes through the same subset
   * (`KithfieldHand-subset.txt` beside the font).
   */
  {
    name: 'KithfieldHand-Bold',
    file: 'KithfieldHand-Bold.ttf',
    sha256: '280acb2be0ba8f8241584d2a4ea5bb830af14f5eab93838d877185a39e70b2f2',
    recipe: {
      kind: 'subset',
      from: {
        file: 'KithfieldHand-Bold.ttf',
        sha256: '539a3e6a1d1c2085d1c02606d1c9019020b5bdf4003819deba6e82b3ea3cd5f4',
      },
    },
  },
  /** The art's hand lettering, as `kithfield-art.js` names it, through the same subset. */
  {
    name: 'Gaegu-Bold',
    file: 'Gaegu-Bold.ttf',
    sha256: 'ebb712600051e5109ccef5c366e069eff2926585b351d80ed5cd1be7c3abf5d0',
    recipe: {
      kind: 'subset',
      from: {
        file: 'Gaegu-Bold.ttf',
        url: `${GOOGLE_FONTS}/gaegu/Gaegu-Bold.ttf`,
        sha256: 'cc38a4af9506a45254d1ce07c589ec473d9e5f0be319e5a77b17c214903f8c1c',
      },
    },
  },
  /** The art's Vietnamese captions. */
  published(
    'PatrickHand-Regular',
    'patrickhand/PatrickHand-Regular.ttf',
    '0f173b3e6cb6d1af25babf7f0057c5ac4ee11f9992b0469bb817e967ef4ad0fc',
  ),
  /** The art's titles (the week page). */
  published(
    'YoungSerif-Regular',
    'youngserif/YoungSerif-Regular.ttf',
    '42bb2602364b28569fdce5eeb6ab3d81cf8090ba81b211f1229ed69f33155523',
  ),
];

/** The SIL Open Font License of each family, and Kithfield Hand's log from the designer. */
export const licenceSources: readonly Source[] = [
  {
    file: 'OFL-Fraunces.txt',
    url: `${GOOGLE_FONTS}/fraunces/OFL.txt`,
    sha256: 'bdf4c22802eaf804f998195871c6b8938aac2ac14b2d78a8bd66a6f1eced833b',
  },
  /** Kithfield Hand ships Gaegu's licence unchanged. */
  {
    file: 'OFL-KithfieldHand.txt',
    url: `${GOOGLE_FONTS}/gaegu/OFL.txt`,
    sha256: '53a9ce47085d9fef613c7ecb3730dc80d25962510bbea231b89564f58240f251',
  },
  {
    file: 'FONTLOG-KithfieldHand.txt',
    sha256: '27d5aa46a762c5fc43d8402689c5359f35af781406cf485558d64e09cf213d72',
  },
  {
    file: 'OFL-Gaegu.txt',
    url: `${GOOGLE_FONTS}/gaegu/OFL.txt`,
    sha256: '53a9ce47085d9fef613c7ecb3730dc80d25962510bbea231b89564f58240f251',
  },
  {
    file: 'OFL-YoungSerif.txt',
    url: `${GOOGLE_FONTS}/youngserif/OFL.txt`,
    sha256: '737d8d343b674c6894f373de71a044b6782c130f2aebf180933d63ddf7a3dc19',
  },
  {
    file: 'OFL-PatrickHand.txt',
    url: `${GOOGLE_FONTS}/patrickhand/OFL.txt`,
    sha256: '377f4f9c19e935228552478eb68cc2ed82910988a60ba60e2ac73b09f32d02d1',
  },
];

/** Files written by hand beside the fonts, which the build leaves alone. */
export const notes: readonly string[] = ['KithfieldHand-subset.txt'];

/** The files the committed fonts are made from (variable fonts, unsubset fonts), each once. */
export const fontInputs: readonly Source[] = [
  ...new Map(
    fontSources.flatMap((s) =>
      s.recipe.kind === 'download' ? [] : [[s.recipe.from.file, s.recipe.from] as const],
    ),
  ).values(),
];
