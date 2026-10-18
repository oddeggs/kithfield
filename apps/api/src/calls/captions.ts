import { type FireCaptionLine, LanguageTag, type PersonId } from '@kithfield/contracts';

import type { Bindings } from '../env';
import type { RoomParticipant } from './livekit';

/*
 * Live captions by the fire (a patron perk, behind each speaker's `captions` consent). A piece of
 * a consenting speaker's audio becomes one caption line per language someone listening asked for.
 * Nothing is stored: the lines go out on the room's `captions` data topic and are gone.
 *
 * Two seams are filled where the features they need live:
 * - `captionAudio`: speech to text, and that text in other languages (Workers AI's Whisper and
 *   translation model, through the `AI` binding).
 * - `captionPerks`: whether a listener's patron perks are on (the shop's entitlements).
 * With either unset, nobody is captioned: phones hear `listening: false` and stop sending.
 */

/** What a piece of speech said, in its own language, and in each other language asked for. */
export type CaptionedAudio = {
  readonly said: LanguageTag;
  readonly text: string;
  /** By language tag; a language missing here gets the line untranslated. */
  readonly translations: Readonly<Record<string, string>>;
};

/** Speech to text for one piece of audio, translated into each of `langs` it wasn't said in. */
export type CaptionAudio = (
  env: Bindings,
  chunk: Uint8Array,
  langs: readonly LanguageTag[],
) => Promise<CaptionedAudio>;

/** Whether this person's patron perks (captions among them) are on. */
export type CaptionPerks = (env: Bindings, person: PersonId) => Promise<boolean>;

let captionAudio: CaptionAudio | null = null;
let captionPerks: CaptionPerks | null = null;

/** Fills the speech seam; answers how to take it out again. */
export function setCaptionAudio(fn: CaptionAudio | null): () => void {
  const prev = captionAudio;
  captionAudio = fn;
  return () => {
    captionAudio = prev;
  };
}

/** Fills the perks seam; answers how to take it out again. */
export function setCaptionPerks(fn: CaptionPerks | null): () => void {
  const prev = captionPerks;
  captionPerks = fn;
  return () => {
    captionPerks = prev;
  };
}

/** Whether the person said yes to captions, and hasn't taken it back. */
export async function captionsAllowed(db: D1Database, person: PersonId): Promise<boolean> {
  const row = await db
    .prepare("SELECT allowed FROM consents WHERE person_id = ? AND feature = 'captions'")
    .bind(person)
    .first<{ allowed: number }>();
  return row?.allowed === 1;
}

/** A listener with captions on, in the language they read them in. */
export type CaptionListener = { readonly person: PersonId; readonly lang: LanguageTag };

/** The room's participants who have captions on, in a language the contract can carry. */
export const listenersIn = (participants: readonly RoomParticipant[]): CaptionListener[] =>
  participants.flatMap((p) => {
    const lang = LanguageTag.safeParse(p.attributes['captionsIn']);
    return lang.success ? [{ person: p.identity, lang: lang.data }] : [];
  });

/** Of these listeners, the ones whose perks are on. Nobody, while the perks seam is unset. */
export async function withPerks(
  env: Bindings,
  listeners: readonly CaptionListener[],
): Promise<CaptionListener[]> {
  const perks = captionPerks;
  if (perks === null) return [];
  const on = await Promise.all(listeners.map((l) => perks(env, l.person)));
  return listeners.filter((_, i) => on[i] === true);
}

/** The line each language's listeners get for one piece of speech. */
export function linesFor(
  speaker: PersonId,
  chunk: number,
  heard: CaptionedAudio,
  langs: readonly LanguageTag[],
): Map<LanguageTag, FireCaptionLine> {
  const lines = new Map<LanguageTag, FireCaptionLine>();
  for (const lang of new Set(langs)) {
    const translated = lang === heard.said ? undefined : heard.translations[lang];
    lines.set(lang, {
      speaker,
      chunk,
      said: heard.said,
      text: heard.text,
      translation: translated === undefined ? null : { lang, text: translated },
    });
  }
  return lines;
}

/** Captions one piece of audio, or null when there is no speech seam to do it. */
export async function caption(
  env: Bindings,
  chunk: Uint8Array,
  langs: readonly LanguageTag[],
): Promise<CaptionedAudio | null> {
  return captionAudio === null ? null : captionAudio(env, chunk, langs);
}
