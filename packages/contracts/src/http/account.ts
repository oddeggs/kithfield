import { z } from 'zod';

import { CountryCode, EpochMs, FarmId, Id, Lang, PersonId, text } from '../primitives';

/*
 * Sign-in itself (anonymous, Apple, Google, email and phone codes) is Better Auth's own API; these
 * are the bodies around it.
 */

/** `POST /v1/rt-token`: a 5-minute socket token. With a farm, for that farm's socket; without, the cottage's. */
export const RtTokenRequest = z.object({ farm: FarmId.optional() });
export type RtTokenRequest = z.infer<typeof RtTokenRequest>;

export const RtTokenResponse = z.object({
  token: z.string().min(16).max(512),
  expiresAt: EpochMs,
});
export type RtTokenResponse = z.infer<typeof RtTokenResponse>;

export const Platform = z.enum(['ios', 'android', 'web', 'macos', 'windows']);
export type Platform = z.infer<typeof Platform>;

/**
 * `PUT /v1/devices/:deviceId`: register a device and its push token with the person's cottage. The
 * device id is made by the app on first launch (a UUID kept in the Keychain), not by the server.
 */
export const RegisterDeviceRequest = z.object({
  platform: Platform,
  name: text(64),
  /** Expo push token; null until notifications are allowed. */
  pushToken: z.string().min(1).max(256).nullable(),
  appVersion: z.string().regex(/^\d+\.\d+\.\d+( \(\d+\))?$/),
});
export type RegisterDeviceRequest = z.infer<typeof RegisterDeviceRequest>;

/**
 * The device's action key, for the share extension and notification reply actions: they send it
 * in the `Kithfield-Action-Key` header to `POST /v1/farms/:id/cmd` without the app's session.
 * Registering again rotates it.
 */
export const RegisterDeviceResponse = z.object({
  actionKey: z.string().regex(/^[A-Za-z0-9_-]{32,256}$/),
});
export type RegisterDeviceResponse = z.infer<typeof RegisterDeviceResponse>;

/** `GET /v1/devices`. Place is a city only. `DELETE /v1/devices/:deviceId` signs one out. */
export const DeviceList = z.object({
  devices: z
    .array(
      z.object({
        device: Id,
        name: text(64),
        platform: Platform,
        city: text(80).nullable(),
        lastActiveAt: EpochMs,
        current: z.boolean(),
      }),
    )
    .max(50),
});
export type DeviceList = z.infer<typeof DeviceList>;

/** `POST /v1/desktop-link` from a computer: a one-time QR code that lives 60 seconds. */
export const DesktopLinkResponse = z.object({
  code: z.string().regex(/^[A-Za-z0-9_-]{16,128}$/),
  expiresAt: EpochMs,
});
export type DesktopLinkResponse = z.infer<typeof DesktopLinkResponse>;

/** `GET /v1/desktop-link/:code` on the phone: what it shows before Face ID approves. */
export const DesktopLinkPreview = z.object({
  name: text(64),
  platform: Platform,
  city: text(80).nullable(),
});
export type DesktopLinkPreview = z.infer<typeof DesktopLinkPreview>;

/** `POST /v1/desktop-link/:code/approve` or `/decline` takes no body. */

/** `POST /v1/me/age`. The year is never shown to anyone; under-age answers `under_age`. */
export const AgeRequest = z.object({
  birthYear: z.int().min(1900).max(2100),
  country: CountryCode,
});
export type AgeRequest = z.infer<typeof AgeRequest>;

/** `POST /v1/me/terms`: the version (its date) of the terms the person accepted. */
export const TermsRequest = z.object({ version: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });
export type TermsRequest = z.infer<typeof TermsRequest>;

/** AI features that send words or voices out, each asked per person before anything is sent. */
export const AiFeature = z.enum(['captions', 'recap']);
export type AiFeature = z.infer<typeof AiFeature>;

/** `PUT /v1/me/consents/:feature`: stored with the time and the consent text version. */
export const ConsentRequest = z.object({
  allowed: z.boolean(),
  textVersion: z.string().regex(/^[A-Za-z0-9._-]{1,32}$/),
});
export type ConsentRequest = z.infer<typeof ConsentRequest>;

/** `GET /v1/me/consents`. */
export const ConsentList = z.object({
  consents: z
    .array(
      z.object({
        feature: AiFeature,
        allowed: z.boolean(),
        textVersion: z.string().regex(/^[A-Za-z0-9._-]{1,32}$/),
        at: EpochMs,
      }),
    )
    .max(8),
});
export type ConsentList = z.infer<typeof ConsentList>;

/** `POST /v1/me/delete`: soft delete; signing in within 30 days restores everything. */
export const DeleteAccountResponse = z.object({ purgeAt: EpochMs });
export type DeleteAccountResponse = z.infer<typeof DeleteAccountResponse>;

/** `POST /v1/deletion-requests` from the website, for someone without the app. */
export const DeletionRequest = z.object({ email: z.email().max(254), lang: Lang });
export type DeletionRequest = z.infer<typeof DeletionRequest>;

/** `POST /v1/waitlist` from the website. Stored hashed. */
export const WaitlistRequest = z.object({ email: z.email().max(254), lang: Lang });
export type WaitlistRequest = z.infer<typeof WaitlistRequest>;

/** `PUT /v1/blocks/:person` blocks, `DELETE` unblocks. Never disclosed. `GET /v1/blocks` lists. */
export const BlockList = z.object({ blocked: z.array(PersonId).max(1000) });
export type BlockList = z.infer<typeof BlockList>;
