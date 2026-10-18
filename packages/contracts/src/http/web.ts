import { z } from 'zod';

import { Lang, Species } from '../primitives';

/*
 * The website's own bodies: the launch list and account deletion for people without the app.
 * Answers never tell anyone whether an address is listed or has an account.
 */

/** A one-time token the website handles: 32 random bytes, base64url. */
export const WebToken = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export type WebToken = z.infer<typeof WebToken>;

/**
 * `POST /v1/waitlist`: keeps the address (keyed by a hash; the address itself only until the launch
 * letter) and sends one letter with a confirm link. `platform` is the phone they'll use, if they
 * said.
 */
export const WaitlistRequest = z.object({
  email: z.email().max(254),
  lang: Lang,
  platform: z.enum(['ios', 'android']).optional(),
});
export type WaitlistRequest = z.infer<typeof WaitlistRequest>;

/**
 * `POST /v1/waitlist` answers 200 with a fresh `pick` token every time, listed address or not, so
 * the answer tells nothing. The thank-you page uses it to save a critter early. The pick binds to
 * this request's pending confirmation and takes effect only when the address confirms; for an
 * address that was already confirmed it is kept but never used.
 */
export const WaitlistResponse = z.object({ pick: WebToken });
export type WaitlistResponse = z.infer<typeof WaitlistResponse>;

/**
 * `PUT /v1/waitlist/pick`: the critter to save, changeable until the address confirms (within the
 * week an unconfirmed address is kept). 204, or 410 `not_found` for an unknown or expired pick.
 */
export const WaitlistPickRequest = z.object({ pick: WebToken, species: Species });
export type WaitlistPickRequest = z.infer<typeof WaitlistPickRequest>;

/**
 * `POST /v1/waitlist/confirm` with the token from the letter: 204, or 410 `not_found` when it is
 * used, expired or unknown.
 */
export const WaitlistConfirmRequest = z.object({ token: WebToken });
export type WaitlistConfirmRequest = z.infer<typeof WaitlistConfirmRequest>;

/**
 * `POST /v1/deletion-requests`: someone without the app asks for their account to go. Always 202;
 * when the address signs in to an account, a 6-digit code goes to it (valid 10 minutes, 5 tries).
 */
export const DeletionRequest = z.object({ email: z.email().max(254), lang: Lang });
export type DeletionRequest = z.infer<typeof DeletionRequest>;

/**
 * `POST /v1/deletion-requests/confirm`: the code from the letter. 202 with `DeleteAccountResponse`
 * (the same 30-day wait as in the app, and every session ends), or 400 `code_invalid` for a wrong,
 * expired or used code, whether or not the address has an account.
 */
export const DeletionConfirmRequest = z.object({
  email: z.email().max(254),
  code: z.string().regex(/^\d{6}$/),
});
export type DeletionConfirmRequest = z.infer<typeof DeletionConfirmRequest>;
