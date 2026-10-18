/** Vowels that take Vietnamese tone marks. */
const VOWELS = ['a', 'ă', 'â', 'e', 'ê', 'i', 'o', 'ô', 'ơ', 'u', 'ư', 'y'];

/** Grave, acute, hook above, tilde and dot below. */
const TONES = ['̀', '́', '̉', '̃', '̣'];

const lower = [
  ...'ăâđêôơư',
  ...VOWELS.flatMap((vowel) => TONES.map((tone) => (vowel + tone).normalize('NFC'))),
];

/**
 * Every precomposed letter Vietnamese writes beyond basic Latin, lower and upper case:
 * ă â đ ê ô ơ ư, and each of the twelve vowels with each of the five tones (ả ạ ằ … ỵ).
 */
export const vietnameseLetters: readonly string[] = [
  ...lower,
  ...lower.map((letter) => letter.toUpperCase()),
];

/** The letters a font has no glyph for. */
export function missingLetters(codePoints: ReadonlySet<number>): string[] {
  return vietnameseLetters.filter((letter) => !codePoints.has(letter.codePointAt(0) ?? -1));
}

/**
 * Combining marks decomposed (NFD) Vietnamese is written with: grave, acute, circumflex, tilde,
 * breve, hook above, horn and dot below. Precomposed letters do not need them; text that arrives
 * decomposed does, and a face without them mixes fonts inside a word.
 */
export const vietnameseCombiningMarks: readonly number[] = [
  0x300, 0x301, 0x302, 0x303, 0x306, 0x309, 0x31b, 0x323,
];

/** The combining marks a font has no glyph for, as code points. */
export function missingMarks(codePoints: ReadonlySet<number>): number[] {
  return vietnameseCombiningMarks.filter((mark) => !codePoints.has(mark));
}
