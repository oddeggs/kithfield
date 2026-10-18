import type { MeSettingsUpdate, RegisterDeviceRequest } from '@kithfield/contracts';

/** A small key-value store (the Keychain on the phone). */
export interface KeyStore {
  getItem(key: string): string | null;
  setItemAsync(key: string, value: string): Promise<void>;
}

export interface PushDeps {
  readonly store: KeyStore;
  /** Whether notifications are allowed (never asks). */
  readonly permission: () => Promise<boolean>;
  /** The Expo push token, or null where there is none (a simulator). */
  readonly token: () => Promise<string | null>;
  /** The phone's IANA time zone. */
  readonly timeZone: () => string;
  /** This install's device id, made once and kept. */
  readonly deviceId: () => Promise<string>;
  /** Names the session signed in now (a digest, never the bearer), to register each one once. */
  readonly session: () => Promise<string>;
  /** What the device is, for `RegisterDeviceRequest`. */
  readonly device: Omit<RegisterDeviceRequest, 'pushToken'>;
  /** `PUT /v1/devices/:deviceId`. */
  readonly registerDevice: (device: string, body: RegisterDeviceRequest) => Promise<void>;
  /** `PATCH /v1/me/settings`. */
  readonly updateSettings: (update: MeSettingsUpdate) => Promise<void>;
}

const KEY = 'kithfield.push';

interface Sent {
  readonly person: string;
  readonly token: string | null;
  readonly zone: string | null;
  /** The session the device was last registered under. */
  readonly session?: string | null;
}

function sentBefore(store: KeyStore, person: string): Sent {
  try {
    const raw = store.getItem(KEY);
    const sent = raw ? (JSON.parse(raw) as Sent) : null;
    if (sent && sent.person === person) return sent;
  } catch {
    // Nothing usable was kept: send both again.
  }
  return { person, token: null, zone: null, session: null };
}

/**
 * Tells the server how to reach this phone: the time zone (for quiet hours and the house floor)
 * whenever it differs from what was last sent, and the phone's one device id under each new
 * session (so Settings lists it and another device can sign it out), with the Expo push token once
 * notifications are allowed and whenever it changes. Run on every launch and right after
 * notifications are allowed; nothing is sent twice for the same person and session.
 */
export async function syncPush(person: string, deps: PushDeps): Promise<void> {
  const before = sentBefore(deps.store, person);
  let { token, zone, session = null } = before;

  const now = deps.timeZone();
  if (now !== zone) {
    await deps.updateSettings({ timeZone: now });
    zone = now;
  }

  // A token that can't be read just now (offline) keeps the one already sent.
  const current = (await deps.permission())
    ? ((await deps.token().catch(() => null)) ?? token)
    : null;
  const signedIn = await deps.session();
  if (current !== token || signedIn !== session) {
    await deps.registerDevice(await deps.deviceId(), { ...deps.device, pushToken: current });
    token = current;
    session = signedIn;
  }

  if (token !== before.token || zone !== before.zone || session !== before.session) {
    await deps.store.setItemAsync(
      KEY,
      JSON.stringify({ person, token, zone, session } satisfies Sent),
    );
  }
}
