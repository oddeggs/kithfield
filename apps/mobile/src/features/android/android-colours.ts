import { day, material, night, type Appearance } from '@kithfield/theme';

/*
 * The Material surfaces `14 Platforms` draws for Android, by appearance: the
 * navigation bar and its active pill (the theme's `material` tokens by day) and the dewdrop FAB.
 * Night follows `12 States`: the night panel, a lifted bubble for the pill, moonlight on it.
 */
export const androidColours = {
  day: {
    navBar: material.navBar,
    navPill: material.navPill,
    navActive: day.ink,
    navInactive: day.ink3,
    fab: day.moss,
    fabIcon: day.ink,
    fabShadow: 'rgba(0,0,0,0.35)',
  },
  night: {
    navBar: night.panel,
    navPill: night.bubble,
    navActive: night.moon,
    navInactive: night.dim,
    fab: day.moss,
    fabIcon: night.moon,
    fabShadow: 'rgba(0,0,0,0.6)',
  },
} as const satisfies Record<Appearance, Record<string, string>>;
