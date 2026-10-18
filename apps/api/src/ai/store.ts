import type { FarmId, Lang, LanguageTag, PersonId } from '@kithfield/contracts';

import type { Bindings } from '../env';

/*
 * Where the AI features keep what they made. D1 holds an index with no words in it; the words are
 * JSON in the media bucket under `ai/`, deleted with the thing they came from:
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

export type CaptionRow = {
  farm_id: string;
  seq: number;
  lang: Lang;
  audio_key: string;
  author_id: string;
  state: 'pending' | 'ready' | 'failed';
  said: string | null;
};

export const captionRow = (db: D1Database, farm: FarmId, seq: number, lang: Lang) =>
  db
    .prepare('SELECT * FROM voice_captions WHERE farm_id = ? AND seq = ? AND lang = ?')
    .bind(farm, seq, lang)
    .first<CaptionRow>();

/** Another language's ready caption of the same voice note, whose transcript can be reused. */
export const readySibling = (db: D1Database, farm: FarmId, seq: number, lang: Lang) =>
  db
    .prepare(
      "SELECT * FROM voice_captions WHERE farm_id = ? AND seq = ? AND lang != ? AND state = 'ready' LIMIT 1",
    )
    .bind(farm, seq, lang)
    .first<CaptionRow>();

export const captionKey = (farm: FarmId, seq: number, lang: Lang) =>
  `${voicePrefix(farm, seq)}${lang}.json`;

/** Asks for a caption: a new or failed one becomes pending. True when a job should be queued. */
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

export async function setCaptionState(
  db: D1Database,
  farm: FarmId,
  seq: number,
  lang: Lang,
  state: CaptionRow['state'],
  said: string | null,
  now: number,
): Promise<void> {
  await db
    .prepare(
      'UPDATE voice_captions SET state = ?, said = ?, updated_at = ? WHERE farm_id = ? AND seq = ? AND lang = ?',
    )
    .bind(state, said, now, farm, seq, lang)
    .run();
}

/** Forgets a voice note's captions in every language, and deletes their words. */
export async function dropCaptions(env: Store, farm: FarmId, seq: number): Promise<void> {
  await env.DB.prepare('DELETE FROM voice_captions WHERE farm_id = ? AND seq = ?')
    .bind(farm, seq)
    .run();
  await deletePrefix(env, voicePrefix(farm, seq));
}

/** Forgets every caption of the person's voice notes, everywhere. */
export async function dropCaptionsBy(env: Store, person: PersonId): Promise<void> {
  const { results } = await env.DB.prepare(
    'SELECT DISTINCT farm_id, seq FROM voice_captions WHERE author_id = ?',
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
