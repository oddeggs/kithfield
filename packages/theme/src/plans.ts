import { day, night, type Appearance } from './colour';

/**
 * The colours `design/06 Plans and Hangouts.dc.html` writes inline for plans, beyond the
 * palette, by job. The design draws plans by day only (the hangout is always at the fire, by
 * night); the night values come from the night palette and are listed in
 * `docs/undesigned-states.md`.
 */
export interface PlanColours {
  /** Hand-lettered moss lines ("a little sprout", "in!"). */
  hand: string;
  /** The tile behind a seed on the plant sheet and on plan cards. */
  seedTile: string;
  /** A resting "someday" seed: its tile, dashed border and title. */
  restingTile: string;
  restingBorder: string;
  restingTitle: string;
  /** The stage the hat-wearer stands on. */
  hatStage: string;
  /** "maybe" and "no answer yet" on the replies list. */
  maybe: string;
  waiting: string;
  /** The card a notification preview sits on. */
  preview: string;
  /** A day's bud card. */
  bud: string;
  /** The check inside a condition's ring once it is met. */
  check: string;
}

export const planColours: Readonly<Record<Appearance, PlanColours>> = {
  day: {
    hand: day.moss,
    seedTile: '#EFE5D3',
    restingTile: '#EFE7DA',
    restingBorder: 'rgba(42,34,29,.2)',
    restingTitle: day.ink2,
    hatStage: '#EFDFCA',
    maybe: '#b07a2c',
    waiting: '#8a7f75',
    preview: '#ece4d6',
    bud: day.card,
    check: '#ffffff',
  },
  night: {
    hand: '#a9c48e',
    seedTile: 'rgba(255,255,255,.08)',
    restingTile: 'rgba(255,255,255,.06)',
    restingBorder: 'rgba(255,255,255,.2)',
    restingTitle: night.moon2,
    hatStage: night.bubble,
    maybe: night.lamp,
    waiting: night.dim,
    preview: night.bubble,
    bud: night.bubble,
    check: night.moon,
  },
};

/** The organiser's hat: a straw hat with a red band, as the design draws it on the stage. */
export const organiserHat = { outfit: 'straw', band: '#c9543e' } as const;

/** The sun patch: always the night-blue panel, by day and by night. */
export const sunPatch = {
  bg: '#2b2e4a',
  text: night.moon,
  eyebrow: '#cfc6d8',
  body: night.moon2,
  /** The day most people lean on. */
  best: '#F8D98A',
  bestText: day.ink,
  /** A day on offer. */
  warm: 'rgba(248,217,138,.28)',
  /** A day nobody picked. */
  empty: 'rgba(255,255,255,.07)',
} as const;

/** The hangout at the fire: glass and text over the night campfire, in either appearance. */
export const fireside = {
  glass: 'rgba(30,32,56,.5)',
  glassBorder: 'rgba(255,255,255,.14)',
  sheet: 'rgba(24,26,48,.62)',
  sheetBorder: 'rgba(255,255,255,.12)',
  ring: '#2a2c48',
  title: '#f6eedb',
  sub: '#e2d8c4',
  text: night.moon,
  label: night.moon2,
  button: 'rgba(255,255,255,.1)',
  sky: night.sky,
  /** "I'm here". */
  here: day.honey,
  hereText: day.ink,
} as const;
