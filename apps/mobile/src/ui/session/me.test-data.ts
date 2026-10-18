import type { Me } from '@kithfield/contracts';

/** A person through the way in; tests change what they need. */
const critter = {
  species: 'fox',
  coat: 'default',
  mark: null,
  accessory: 'scarf',
  outfit: null,
  outfitColor: null,
  companion: null,
  cottage: null,
} as const;

export const me = (change: Partial<Me> = {}): Me => ({
  person: 'p1',
  name: 'June',
  critter,
  birthday: null,
  signIn: ['email'],
  ageOk: true,
  termsVersion: '2026-10-18',
  currentTermsVersion: '2026-10-18',
  hibernating: false,
  settings: {
    lang: 'en',
    timeZone: 'Europe/London',
    quietHours: null,
    discoverableByPhone: false,
    lightWindow: true,
    nudges: 'few',
    backOffWhenQuiet: true,
    inTogetherStickers: true,
  },
  purgeAt: null,
  ...change,
});
