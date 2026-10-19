import type { FarmId, Lang, LanguageTag, PersonId } from '@kithfield/contracts';

import type { Bindings } from '../env';

/*
 * Where the AI features keep what they made. D1 holds an index with no words in it; the words are
 * JSON in the media bucket under `ai/`, deleted with the thing they came from:
 * - `ai/voice/<farm>/<seq>/said.json`: what Whisper heard in a voice note, once.
 * - `ai/voice/<farm>/<seq>/<lang>.json`: a voice note's caption, asked for in `lang`.
 * - `ai/recap/<farm>/<week>/<lang>.json`: a farm's Sunday letter.
 */

type Store = Pick<Bindings, 'DB' | 'MEDIA'>;

export const voicePrefix = (farm: FarmId, seq: number) => `ai/voice/${farm}/${seq}/`;
export const recapPrefix = (farm: FarmId, week: string) => `ai/recap/${farm}/${week}/`;

/** The words of a caption: what was said, and its translation when it was said in another language. */
export type CaptionWords = {
  said: LanguageTag;
  text: string;
  translation: { lang: Lang; text: string } | null;
};

export type Letter = { lang: Lang; title: string; body: string };

export async function putJson(env: Store, key: string, value: unknown): Promise<void> {
  await env.MEDIA.put(key, JSON.stringify(value), {
    httpMetadata: { contentType: 'application/json' },
  });
}

export async function getJson<T>(env: Store, key: string): Promise<T | null> {
  const object = await env.MEDIA.get(key);
  return object === null ? null : await object.json();
}

/** Deletes every object under a prefix. */
export async function deletePrefix(env: Store, prefix: string): Promise<void> {
  let cursor: string | undefined;
  do {
    const listed = await env.MEDIA.list({ prefix, ...(cursor === undefined ? {} : { cursor }) });
    const keys = listed.objects.map((o) => o.key);
    if (keys.length > 0) await env.MEDIA.delete(keys);
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor !== undefined);
}

/* Voice-note captions */

export type TranscriptRow = {
  farm_id: string;
  seq: number;
  audio_key: string;
  author_id: string;
  state: 'hearing' | 'heard' | 'silent';
  said: string | null;
  claimed_at: number;
};

export const transcriptRow = (db: D1Database, farm: FarmId, seq: number) =>
  db
    .prepare('SELECT * FROM voice_transcripts WHERE farm_id = ? AND seq = ?')
    .bind(farm, seq)
    .first<TranscriptRow>();

export const transcriptKey = (farm: FarmId, seq: number) => `${voicePrefix(farm, seq)}said.json`;

/** What Whisper heard, kept once for every language asked. */
export type Heard = { said: LanguageTag; text: string };

/**
 * Claims hearing a voice note, so two languages asked at once share one Whisper run. A claim older
 * than `staleBefore` is taken over (its job died). Answers the claim's time, or null when another
 * job holds it or it is already heard.
 */
export async function claimTranscript(
  db: D1Database,
  row: { farm: FarmId; seq: number; audio: string; author: PersonId },
  now: number,
  staleBefore: number,
): Promise<number | null> {
  const result = await db
    .prepare(
      `INSERT INTO voice_transcripts (farm_id, seq, audio_key, author_id, state, claimed_at)
       VALUES (?1, ?2, ?3, ?4, 'hearing', ?5)
       ON CONFLICT (farm_id, seq) DO UPDATE SET claimed_at = ?5
       WHERE voice_transcripts.state = 'hearing' AND voice_transcripts.claimed_at < ?6`,
    )
    .bind(row.farm, row.seq, row.audio, row.author, now, staleBefore)
    .run();
  return result.meta.changes > 0 ? now : null;
}

/** Finishes a claim; false when the claim was lost (taken over, or forgotten meanwhile). */
export async function finishTranscript(
  db: D1Database,
  farm: FarmId,
  seq: number,
  claim: number,
  state: 'heard' | 'silent',
  said: string,
): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE voice_transcripts SET state = ?, said = ?
       WHERE farm_id = ? AND seq = ? AND state = 'hearing' AND claimed_at = ?`,
    )
    .bind(state, said, farm, seq, claim)
    .run();
  return result.meta.changes > 0;
}

/** Lets go of a claim whose Whisper run failed, so the retry can hear it at once. */
export async function releaseTranscript(
  db: D1Database,
  farm: FarmId,
  seq: number,
  claim: number,
): Promise<void> {
  await db
    .prepare(
      "DELETE FROM voice_transcripts WHERE farm_id = ? AND seq = ? AND state = 'hearing' AND claimed_at = ?",
    )
    .bind(farm, seq, claim)
    .run();
}

export type CaptionRow = {
  farm_id: string;
  seq: number;
  lang: Lang;
  audio_key: string;
  author_id: string;
  state: 'pending' | 'ready' | 'failed' | 'silent';
  said: string | null;
};

export const captionRow = (db: D1Database, farm: FarmId, seq: number, lang: Lang) =>
  db
    .prepare('SELECT * FROM voice_captions WHERE farm_id = ? AND seq = ? AND lang = ?')
    .bind(farm, seq, lang)
    .first<CaptionRow>();

export const captionKey = (farm: FarmId, seq: number, lang: Lang) =>
  `${voicePrefix(farm, seq)}${lang}.json`;

/**
 * Asks for a caption: a new or failed one becomes pending; a silent one stays silent and is never
 * heard again. True when a job should be queued.
 */
export async function askCaption(
  db: D1Database,
  row: { farm: FarmId; seq: number; lang: Lang; audio: string; author: PersonId },
  now: number,
): Promise<boolean> {
  const result = await db
    .prepare(
      `INSERT INTO voice_captions (farm_id, seq, lang, audio_key, author_id, state, asked_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, 'pending', ?6, ?6)
       ON CONFLICT (farm_id, seq, lang) DO UPDATE SET state = 'pending', updated_at = ?6
       WHERE voice_captions.state = 'failed'`,
    )
    .bind(row.farm, row.seq, row.lang, row.audio, row.author, now)
    .run();
  return result.meta.changes > 0;
}

/**
 * Moves a pending caption on. Only a pending one moves, so a caption forgotten meanwhile (its row
 * gone) stays gone; false then, and the caller deletes what it wrote.
 */
export async function settleCaption(
  db: D1Database,
  farm: FarmId,
  seq: number,
  lang: Lang,
  state: 'ready' | 'failed' | 'silent',
  said: string | null,
  now: number,
): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE voice_captions SET state = ?, said = ?, updated_at = ?
       WHERE farm_id = ? AND seq = ? AND lang = ? AND state = 'pending'`,
    )
    .bind(state, said, now, farm, seq, lang)
    .run();
  return result.meta.changes > 0;
}

/** Forgets a voice note's captions in every language and its transcript, and deletes their words. */
export async function dropCaptions(env: Store, farm: FarmId, seq: number): Promise<void> {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM voice_captions WHERE farm_id = ? AND seq = ?').bind(farm, seq),
    env.DB.prepare('DELETE FROM voice_transcripts WHERE farm_id = ? AND seq = ?').bind(farm, seq),
  ]);
  await deletePrefix(env, voicePrefix(farm, seq));
}

/** Forgets every caption of the person's voice notes, everywhere. */
export async function dropCaptionsBy(env: Store, person: PersonId): Promise<void> {
  const { results } = await env.DB.prepare(
    `SELECT farm_id, seq FROM voice_captions WHERE author_id = ?1
     UNION SELECT farm_id, seq FROM voice_transcripts WHERE author_id = ?1`,
  )
    .bind(person)
    .all<{ farm_id: string; seq: number }>();
  for (const row of results) await dropCaptions(env, row.farm_id, row.seq);
}

/* Sunday letters */

export type LetterRow = { lang: Lang; state: 'writing' | 'written' | 'failed'; updated_at: number };

export const letterRows = async (db: D1Database, farm: FarmId, week: string) =>
  (
    await db
      .prepare('SELECT lang, state, updated_at FROM recap_letters WHERE farm_id = ? AND week = ?')
      .bind(farm, week)
      .all<LetterRow>()
  ).results;

export const letterKey = (farm: FarmId, week: string, lang: Lang) =>
  `${recapPrefix(farm, week)}${lang}.json`;

/** Forgets a week's letters in every language, and whose words went into them. */
export async function dropLetters(env: Store, farm: FarmId, week: string): Promise<void> {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM recap_letters WHERE farm_id = ? AND week = ?').bind(farm, week),
    env.DB.prepare('DELETE FROM recap_sources WHERE farm_id = ? AND week = ?').bind(farm, week),
  ]);
  await deletePrefix(env, recapPrefix(farm, week));
}

/**
 * Marks a letter written. Only one still being written moves, so a letter forgotten meanwhile
 * stays gone; false then, and the caller deletes what it wrote.
 */
export async function settleLetter(
  db: D1Database,
  farm: FarmId,
  week: string,
  lang: Lang,
  now: number,
): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE recap_letters SET state = 'written', updated_at = ?
       WHERE farm_id = ? AND week = ? AND lang = ? AND state = 'writing'`,
    )
    .bind(now, farm, week, lang)
    .run();
  return result.meta.changes > 0;
}

/** A farm that is gone: everything the AI made for it, its letters and its captions. */
export async function dropFarm(env: Store, farm: FarmId): Promise<void> {
  await env.DB.batch(
    ['recap_letters', 'recap_sources', 'voice_captions', 'voice_transcripts', 'recap_schedule'].map(
      (table) => env.DB.prepare(`DELETE FROM ${table} WHERE farm_id = ?`).bind(farm),
    ),
  );
  await deletePrefix(env, `ai/recap/${farm}/`);
  await deletePrefix(env, `ai/voice/${farm}/`);
}

/** Forgets every letter the person's words went into. */
export async function dropLettersFrom(env: Store, person: PersonId): Promise<void> {
  const { results } = await env.DB.prepare(
    'SELECT farm_id, week FROM recap_sources WHERE person_id = ?',
  )
    .bind(person)
    .all<{ farm_id: string; week: string }>();
  for (const row of results) await dropLetters(env, row.farm_id, row.week);
}

/* Words owed a delete */

/** Deletes the R2 words of captions D1 already forgot (when their media went). */
export async function sweepOwed(env: Store, limit = 200): Promise<number> {
  const { results } = await env.DB.prepare(
    'SELECT prefix FROM ai_purge_owed ORDER BY owed_at LIMIT ?',
  )
    .bind(limit)
    .all<{ prefix: string }>();
  for (const { prefix } of results) {
    await deletePrefix(env, prefix);
    await env.DB.prepare('DELETE FROM ai_purge_owed WHERE prefix = ?').bind(prefix).run();
  }
  return results.length;
}
