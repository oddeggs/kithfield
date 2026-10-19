import { day, night, type Appearance } from '@kithfield/theme';

/*
 * The Material surfaces `14 Platforms` draws for Android (14-05 to 14-08) that the shared palette
 * has no token for: the navigation bar, its active pill, and the widget's paper. Night follows
 * `12 States`: the night panel, a lifted bubble for the pill, moonlight on it.
 */
export const androidColours = {
  day: {
    navBar: '#F1EADD',
    navPill: '#DCE6C9',
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
