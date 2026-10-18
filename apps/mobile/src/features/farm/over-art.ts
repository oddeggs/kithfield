import { day } from '@kithfield/theme';

import { palettes } from '../../ui/theme/palette';

/** A theme colour (`#RRGGBB`) at an alpha. */
export function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/**
 * Chrome drawn straight over the farm's art: hand-lettered bubbles and their ink. The art keeps
 * its paper by night (its own night pass darkens the scene), so these stay in day colours.
 */
export const overArt = {
  paper: withAlpha(palettes.day.panel, 0.92),
  paperNight: withAlpha(palettes.day.panel, 0.86),
  ink: day.ink,
  inkFg: day.paper,
  shadow: '0 4px 12px -6px rgba(60,40,20,0.45)',
} as const;
