import { type FontName } from '@kithfield/theme';

/** google/fonts, pinned: the repository Google Fonts publishes from. */
const GOOGLE_FONTS =
  'https://raw.githubusercontent.com/google/fonts/47d54ca1ebb14fd864695f1d39dc734f39017c33/ofl';

/**
 * Google Fonts' own static cuts of Lora (the repository ships only the variable font), as the
 * Google Fonts CSS API serves them.
 */
const GSTATIC_LORA = 'https://fonts.gstatic.com/s/lora/v37';

export interface Source {
  /** File name in `packages/theme/fonts/`. */
  file: string;
  url: string;
  sha256: string;
}

export interface FontSource extends Source {
  name: FontName;
}

/** Every embedded font file, unmodified, with the SHA-256 of the bytes Google serves. */
export const fontSources: readonly FontSource[] = [
  {
    name: 'YoungSerif-Regular',
    file: 'YoungSerif-Regular.ttf',
    url: `${GOOGLE_FONTS}/youngserif/YoungSerif-Regular.ttf`,
    sha256: '42bb2602364b28569fdce5eeb6ab3d81cf8090ba81b211f1229ed69f33155523',
  },
  {
    name: 'Gaegu-Bold',
    file: 'Gaegu-Bold.ttf',
    url: `${GOOGLE_FONTS}/gaegu/Gaegu-Bold.ttf`,
    sha256: 'cc38a4af9506a45254d1ce07c589ec473d9e5f0be319e5a77b17c214903f8c1c',
  },
  {
    name: 'PatrickHand-Regular',
    file: 'PatrickHand-Regular.ttf',
    url: `${GOOGLE_FONTS}/patrickhand/PatrickHand-Regular.ttf`,
    sha256: '0f173b3e6cb6d1af25babf7f0057c5ac4ee11f9992b0469bb817e967ef4ad0fc',
  },
  {
    name: 'Lora-Regular',
    file: 'Lora-Regular.ttf',
    url: `${GSTATIC_LORA}/0QI6MX1D_JOuGQbT0gvTJPa787weuyJG.ttf`,
    sha256: '1d37d1e34c77be80f0119754ad78df9aad30d5b1c78132a4cbdac0fe567f5d4f',
  },
  {
    name: 'Lora-SemiBold',
    file: 'Lora-SemiBold.ttf',
    url: `${GSTATIC_LORA}/0QI6MX1D_JOuGQbT0gvTJPa787zAvCJG.ttf`,
    sha256: '36120862013ba0d8059ee03b3f6155d6420cabbf0743ccf5542f22ef918c20a2',
  },
];

/** The SIL Open Font License of each family, from the same pinned repository. */
export const licenceSources: readonly Source[] = [
  {
    file: 'OFL-YoungSerif.txt',
    url: `${GOOGLE_FONTS}/youngserif/OFL.txt`,
    sha256: '737d8d343b674c6894f373de71a044b6782c130f2aebf180933d63ddf7a3dc19',
  },
  {
    file: 'OFL-Gaegu.txt',
    url: `${GOOGLE_FONTS}/gaegu/OFL.txt`,
    sha256: '53a9ce47085d9fef613c7ecb3730dc80d25962510bbea231b89564f58240f251',
  },
  {
    file: 'OFL-PatrickHand.txt',
    url: `${GOOGLE_FONTS}/patrickhand/OFL.txt`,
    sha256: '377f4f9c19e935228552478eb68cc2ed82910988a60ba60e2ac73b09f32d02d1',
  },
  {
    file: 'OFL-Lora.txt',
    url: `${GOOGLE_FONTS}/lora/OFL.txt`,
    sha256: '1d9a970809ac804b582a6ce7f0ebc4e7fefcbfd7ff6299cad35ee656a21be716',
  },
];

export const allSources: readonly Source[] = [...fontSources, ...licenceSources];
