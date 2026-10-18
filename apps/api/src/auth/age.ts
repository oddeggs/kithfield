/** The minimum age where no local rule asks for more. */
export const DEFAULT_MINIMUM_AGE = 13;

/**
 * Countries whose age of digital consent is above 13: the EU and EEA members' choices under
 * GDPR article 8, Vietnam (Decree 13/2023: under 16 needs a parent), South Korea and China (14).
 */
const minimumAgeByCountry: Readonly<Record<string, number>> = {
  AT: 14,
  BG: 14,
  CN: 14,
  CY: 14,
  CZ: 15,
  DE: 16,
  ES: 14,
  FR: 15,
  GR: 15,
  HR: 16,
  HU: 16,
  IE: 16,
  IT: 14,
  KR: 14,
  LI: 16,
  LT: 14,
  LU: 16,
  NL: 16,
  PL: 16,
  RO: 16,
  SI: 15,
  SK: 16,
  VN: 16,
};

export function minimumAge(country: string): number {
  return minimumAgeByCountry[country] ?? DEFAULT_MINIMUM_AGE;
}

export type AgeCheck = 'ok' | 'under_age' | 'invalid';

/**
 * Only the birth year is asked, so the age is known to within a year. Someone counts as old
 * enough only when they certainly are: born at least the minimum age plus one years before this
 * calendar year (UTC), so a birthday later this year never lets a younger person in.
 */
export function checkAge(input: { birthYear: number; country: string; now: number }): AgeCheck {
  const year = new Date(input.now).getUTCFullYear();
  if (input.birthYear > year) return 'invalid';
  const youngestPossibleAge = year - input.birthYear - 1;
  return youngestPossibleAge >= minimumAge(input.country) ? 'ok' : 'under_age';
}
