import { MeSettings, type MeSettingsUpdate } from '@kithfield/contracts';
import { z } from 'zod';

/** The person's settings plus what the cottage keeps for itself. */
export const CottageProfile = z.object({
  settings: MeSettings,
  hibernating: z.boolean(),
  /** Nudges sent since the person last came back on their own. */
  nudgesSinceBack: z.int().min(0),
  /** A note from the safety team waits to be fetched. */
  safetyNote: z.boolean(),
  /** The zone of the person's last quiet hours, for the house floor when they have none. */
  lastTimeZone: z.string(),
});
export type CottageProfile = z.infer<typeof CottageProfile>;

/**
 * A new cottage's settings. Quiet hours start at the house floor (10pm to 8am) in UTC until the
 * app sends the person's own with their time zone.
 */
export const DEFAULT_SETTINGS: MeSettings = {
  lang: 'en',
  quietHours: { from: '22:00', to: '08:00', timeZone: 'UTC' },
  discoverableByPhone: false,
  lightWindow: true,
  nudges: 'few',
  backOffWhenQuiet: true,
  inTogetherStickers: false,
};

const DEFAULT_PROFILE: CottageProfile = {
  settings: DEFAULT_SETTINGS,
  hibernating: false,
  nudgesSinceBack: 0,
  safetyNote: false,
  lastTimeZone: 'UTC',
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

/** Applies a settings change, remembering the zone of any new quiet hours. */
export function applySettings(profile: CottageProfile, update: MeSettingsUpdate): CottageProfile {
  const given = Object.entries(update).filter(([, value]) => value !== undefined);
  const settings = { ...profile.settings, ...Object.fromEntries(given) };
  const zone = settings.quietHours?.timeZone ?? profile.lastTimeZone;
  return { ...profile, settings: MeSettings.parse(settings), lastTimeZone: zone };
}
