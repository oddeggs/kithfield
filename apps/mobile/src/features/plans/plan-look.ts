import { day, night } from '@kithfield/theme';

import { useTheme } from '../../ui/theme/theme-provider';

/**
 * The colours `06 Plans and Hangouts` writes inline beyond the library's palette, by job, in each
 * appearance. The design draws these screens in day only (the hangout is always at the fire, by
 * night); night values come from the night palette, as `docs/undesigned-states.md` lists.
 */
export interface PlanLook {
  /** Hand-lettered moss lines ("a little sprout", "in!"), lighter at night to read on navy. */
  hand: string;
  /** The tile behind a seed on the plant sheet and plan cards. */
  seedTile: string;
  /** A resting seed's tile. */
  restingTile: string;
  restingBorder: string;
  restingTitle: string;
  /** The hat-wearer's stage. */
  hatStage: string;
  /** "maybe" and "no answer yet" on the replies list. */
  maybe: string;
  waiting: string;
  /** The notification preview's card. */
  preview: string;
  /** A day's bud card, with the ring of the one you lean on. */
  bud: string;
}

const dayLook: PlanLook = {
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
};

const nightLook: PlanLook = {
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
};

export function usePlanLook(): PlanLook {
  return useTheme().appearance === 'night' ? nightLook : dayLook;
}

/** The sun patch: always the night-blue panel, by day and by night. */
export const sunPatch = {
  bg: '#2b2e4a',
  text: night.moon,
  eyebrow: '#cfc6d8',
  body: night.moon2,
  /** The day most people can do. */
  best: '#F8D98A',
  bestText: day.ink,
  /** A day someone can do. */
  warm: 'rgba(248,217,138,.28)',
  /** A day nobody picked. */
  empty: 'rgba(255,255,255,.07)',
} as const;

/** The hangout at the fire: glass and text over the night campfire, in both appearances. */
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
  bubble: 'rgba(30,32,56,.6)',
  sky: night.sky,
  homeIndicator: night.moon,
} as const;
