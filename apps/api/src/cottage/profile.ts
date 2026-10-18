import { MeSettings, type MeSettingsUpdate } from '@kithfield/contracts';
import { z } from 'zod';

import { type QuietWindow, quietWindows } from '../push/policy';

/** The person's settings plus what the cottage keeps for itself. */
export const CottageProfile = z.object({
  settings: MeSettings,
  hibernating: z.boolean(),
  /** Nudges sent since the person last came back on their own. */
  nudgesSinceBack: z.int().min(0),
  /** A note from the safety team waits to be fetched. */
  safetyNote: z.boolean(),
  /** The app has sent the person's time zone; until then `settings.timeZone` is only UTC. */
  zoneKnown: z.boolean().default(false),
});
export type CottageProfile = z.infer<typeof CottageProfile>;

/**
 * A new cottage's settings. The app sends the person's `timeZone` on first launch; until then the
 * zone is UTC. No quiet hours of their own: the house floor (10pm to 8am in their zone) holds
 * pushes anyway. Friends may draw them into together stickers unless they opt
 * out in settings (design 08); exporting one still asks everyone in it.
 */
export const DEFAULT_SETTINGS: MeSettings = {
  lang: 'en',
  timeZone: 'UTC',
  quietHours: null,
  discoverableByPhone: false,
  lightWindow: true,
  nudges: 'few',
  backOffWhenQuiet: true,
  inTogetherStickers: true,
};

const DEFAULT_PROFILE: CottageProfile = {
  settings: DEFAULT_SETTINGS,
  hibernating: false,
  nudgesSinceBack: 0,
  safetyNote: false,
  zoneKnown: false,
};

export function readProfile(sql: SqlStorage): CottageProfile {
  const row = sql.exec<{ json: string }>('SELECT json FROM profile WHERE id = 1').toArray()[0];
  if (row === undefined) return DEFAULT_PROFILE;
  return CottageProfile.parse(JSON.parse(row.json));
}

export function writeProfile(sql: SqlStorage, profile: CottageProfile): void {
  sql.exec(
    'INSERT INTO profile (id, json) VALUES (1, ?) ON CONFLICT (id) DO UPDATE SET json = excluded.json',
    JSON.stringify(profile),
  );
}

export function updateProfile(
  sql: SqlStorage,
  change: (profile: CottageProfile) => CottageProfile,
): CottageProfile {
  const next = change(readProfile(sql));
  writeProfile(sql, next);
  return next;
}

/** The person's zone, as the app last sent it. */
export function zoneOf(profile: CottageProfile): string {
  return profile.settings.timeZone;
}

/** Every quiet window the person's pushes wait out. */
export function quietOf(profile: CottageProfile): QuietWindow[] {
  return quietWindows(profile.settings.quietHours, zoneOf(profile));
}

export function applySettings(profile: CottageProfile, update: MeSettingsUpdate): CottageProfile {
  const given = Object.entries(update).filter(([, value]) => value !== undefined);
  const settings = MeSettings.parse({ ...profile.settings, ...Object.fromEntries(given) });
  return { ...profile, settings, zoneKnown: profile.zoneKnown || update.timeZone !== undefined };
}
