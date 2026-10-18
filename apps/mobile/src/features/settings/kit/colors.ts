import { day, night } from '@kithfield/theme';

import { useTheme } from '../../../ui/theme/theme-provider';

/**
 * The inks `11 Settings and Safety` writes inline, by job. Night values the design doesn't draw
 * come from the library's night palette (logged in `docs/undesigned-states.md`).
 */
export interface KitColors {
  /** Value text and chevrons at the end of a row. */
  value: string;
  chevron: string;
  /** Section labels over groups. */
  label: string;
  /** Settings' quieter section labels and icon tiles. */
  settingsLabel: string;
  settingsTile: string;
  /** Paragraph text in notes and cards (`#4a3f37`). */
  body2: string;
  /** The stage behind your critter on the You tab. */
  stage: string;
  /** The hibernate tile's cool tint and its moon. */
  hibernateTile: string;
  hibernateMoon: string;
  /** The moss info panel. */
  info: { bg: string; fg: string; strong: string };
  /** The honey "resting" note and the keeper badge. */
  honeyNote: { bg: string; fg: string; icon: string };
  helperBadge: { bg: string; fg: string };
  keeperBadge: { bg: string; fg: string };
  /** Destructive text (Sign out, Leave quietly, Remove). */
  danger: string;
  radioOff: string;
  radioOn: string;
  /** The empty cottages of the farm's room meter. */
  cottageEmpty: string;
  /** The glass pill over farm art ("Change land"). */
  glass: { fill: string; border: string };
  /** The menu's shadow. */
  menuShadow: string;
  /** The tag above the critter on the You tab. */
  tag: string;
  link: string;
}

const dayKit: KitColors = {
  value: day.ink3,
  chevron: '#b3a99f',
  label: day.ink3,
  settingsLabel: '#7d7168',
  settingsTile: '#EFE7DA',
  body2: day.ink2,
  stage: '#EDE3D3',
  hibernateTile: '#E6ECEF',
  hibernateMoon: '#5d6475',
  info: { bg: day.mossTint, fg: '#3f4d33', strong: '#3f4d33' },
  honeyNote: { bg: day.honeyTint, fg: '#5b4a35', icon: '#8a5a1c' },
  helperBadge: { bg: day.mossTint, fg: '#3f5a31' },
  keeperBadge: { bg: day.honeyTint, fg: '#8a5a1c' },
  danger: day.clay,
  radioOff: 'rgba(42,34,29,.3)',
  radioOn: day.moss,
  cottageEmpty: 'rgba(42,34,29,.22)',
  glass: { fill: 'rgba(251,247,240,.78)', border: 'rgba(255,255,255,.6)' },
  menuShadow: '0 14px 40px -12px rgba(40,25,10,.4)',
  tag: 'rgba(251,247,240,.92)',
  link: day.moss,
};

const nightKit: KitColors = {
  value: night.moon2,
  chevron: night.dim,
  label: night.moon2,
  settingsLabel: night.dim,
  settingsTile: 'rgba(255,255,255,.08)',
  body2: night.moon2,
  stage: '#2b2e4a',
  hibernateTile: 'rgba(255,255,255,.08)',
  hibernateMoon: night.moon2,
  info: { bg: 'rgba(169,196,142,.16)', fg: night.moon2, strong: '#a9c48e' },
  honeyNote: { bg: '#34385a', fg: night.moon2, icon: night.lamp },
  helperBadge: { bg: 'rgba(169,196,142,.16)', fg: '#a9c48e' },
  keeperBadge: { bg: 'rgba(232,180,78,.18)', fg: night.lamp },
  danger: '#e08a6c',
  radioOff: 'rgba(255,255,255,.3)',
  radioOn: day.moss,
  cottageEmpty: 'rgba(244,236,218,.22)',
  glass: { fill: 'rgba(30,32,56,.5)', border: 'rgba(255,255,255,.14)' },
  menuShadow: '0 14px 40px -12px rgba(0,0,0,.6)',
  tag: 'rgba(35,38,63,.92)',
  link: '#a9c48e',
};

export function useKitColors(): KitColors {
  const { appearance } = useTheme();
  return appearance === 'night' ? nightKit : dayKit;
}
