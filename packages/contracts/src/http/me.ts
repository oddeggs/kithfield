import { z } from 'zod';

import {
  Critter,
  DisplayName,
  EpochMs,
  FarmId,
  Id,
  Lang,
  LocalTime,
  MonthDay,
  PersonId,
  Seq,
  TimeZone,
  text,
} from '../primitives';

/* The person: `GET /v1/me`, their profile and settings, hibernating, contacts and remember-me seeds. */

export const SignInMethod = z.enum(['apple', 'google', 'email', 'phone']);
export type SignInMethod = z.infer<typeof SignInMethod>;

/** Pushes wait until the end of quiet hours, in the person's own time zone (`timeZone`). */
export const QuietHours = z.object({ from: LocalTime, to: LocalTime });
export type QuietHours = z.infer<typeof QuietHours>;

/**
 * The person's settings. The app sends `timeZone` (from device settings) and `quietHours` on first
 * launch and whenever the zone changes. Whatever quiet hours say, the house floor holds: no push
 * between 10pm and 8am in the person's time zone.
 */
export const MeSettings = z.object({
  lang: Lang,
  /** The person's own time zone, for quiet hours, the house floor and slow posts. */
  timeZone: TimeZone,
  quietHours: QuietHours.nullable(),
  /** Friends who have the person's number can find them; opt-in. */
  discoverableByPhone: z.boolean(),
  /** Light my window when I'm on. */
  lightWindow: z.boolean(),
  /** How many gentle nudges a week. */
  nudges: z.enum(['off', 'few', 'some']),
  /** Back off when I go quiet: nudges rest after two are ignored. */
  backOffWhenQuiet: z.boolean(),
  /** Friends may draw this person into together stickers. */
  inTogetherStickers: z.boolean(),
});
export type MeSettings = z.infer<typeof MeSettings>;

/** `PATCH /v1/me/settings`: any of the settings. */
export const MeSettingsUpdate = MeSettings.partial().refine((s) => Object.keys(s).length > 0, {
  message: 'Change at least one setting',
});
export type MeSettingsUpdate = z.infer<typeof MeSettingsUpdate>;

/** `GET /v1/me`. An anonymous person has no sign-in methods yet. */
export const Me = z.object({
  person: PersonId,
  name: DisplayName.nullable(),
  critter: Critter.nullable(),
  birthday: MonthDay.nullable(),
  signIn: z.array(SignInMethod).max(4),
  ageOk: z.boolean(),
  termsVersion: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  hibernating: z.boolean(),
  settings: MeSettings,
  /** Set while a deletion waits its 30 days; signing in cancels it. */
  purgeAt: EpochMs.nullable(),
});
export type Me = z.infer<typeof Me>;

/**
 * `PATCH /v1/me/profile`: the person's name, critter and birthday (day and month, opt-in; null
 * clears it), any of them. Answers with `Me`. The server stores them on the person, then writes a
 * `critter_changed` on their behalf (one of `ON_BEHALF_KINDS`) on every farm they live on, carrying
 * exactly the keys that changed, under the same names and types: `name`, `critter`, `birthday`.
 * Nothing is written when nothing changed.
 */
export const MeProfileUpdate = z
  .object({ name: DisplayName, critter: Critter, birthday: MonthDay.nullable() })
  .partial()
  .refine((p) => Object.keys(p).length > 0, { message: 'Change at least one thing' });
export type MeProfileUpdate = z.infer<typeof MeProfileUpdate>;

/** `PUT /v1/me/hibernate`: the server writes `hibernate` on every farm the person lives on. */
export const HibernateRequest = z.object({ on: z.boolean() });
export type HibernateRequest = z.infer<typeof HibernateRequest>;

/** A phone number hashed on the phone: SHA-256 of its E.164 form, lowercase hex. */
export const ContactHash = z.string().regex(/^[0-9a-f]{64}$/);
export type ContactHash = z.infer<typeof ContactHash>;

/** `POST /v1/contacts/match`: which contacts are on Kithfield and discoverable. */
export const ContactMatchRequest = z.object({ hashes: z.array(ContactHash).min(1).max(2000) });
export type ContactMatchRequest = z.infer<typeof ContactMatchRequest>;

export const ContactMatchResponse = z.object({
  matches: z
    .array(
      z.object({
        hash: ContactHash,
        person: PersonId,
        name: DisplayName.nullable(),
        critter: Critter.nullable(),
      }),
    )
    .max(2000),
});
export type ContactMatchResponse = z.infer<typeof ContactMatchResponse>;

/**
 * `POST /v1/remember`: a remember-me seed ("interview Thursday" becomes a nudge to ask how it
 * went). Personal: kept by the person's cottage, never in a farm log, and it grows nothing.
 * `GET /v1/remember` lists them; `DELETE /v1/remember/:id` removes one.
 */
export const RememberRequest = z.object({
  farm: FarmId,
  fromSeq: Seq.optional(),
  about: PersonId,
  title: text(80),
  nudgeAt: EpochMs,
});
export type RememberRequest = z.infer<typeof RememberRequest>;

export const RememberResponse = z.object({ id: Id });
export type RememberResponse = z.infer<typeof RememberResponse>;

export const RememberSeed = RememberRequest.extend({ id: Id, createdAt: EpochMs });
export type RememberSeed = z.infer<typeof RememberSeed>;

export const RememberList = z.object({ seeds: z.array(RememberSeed).max(200) });
export type RememberList = z.infer<typeof RememberList>;
