import {
  isTombstone,
  LIMITS,
  type PersonId,
  Seq,
  VoiceCaption,
  type VoiceCaptionJob,
  VoiceCaptionRequest,
  VoicePayload,
  Lang,
} from '@kithfield/contracts';
import { Hono } from 'hono';

import type { SessionEnv } from '../auth';
import type { Bindings } from '../env';
import { body, type Ctx, fail, member, signedIn } from '../farm/http';
import { hasConsent } from './consent';
import { eventAt, type Envelope } from './farm-reads';
import { type AiBinding, transcribe, translate } from './models';
import {
  askCaption,
  type CaptionRow,
  type CaptionWords,
  captionKey,
  captionRow,
  dropCaptions,
  getJson,
  putJson,
  readySibling,
  setCaptionState,
} from './store';

/*
 * Voice-note captions. A friend asks for one in their language (`POST
 * /v1/farms/:id/voice/:seq/caption {lang}`); if the voice note's author said yes to
 * `voice_notes`, a `VoiceCaptionJob` goes on the `ai` queue and the answer is `pending` until it
 * is `ready` (`GET` the same path with `?lang=`). Whisper hears it once; another language only
 * translates. A caption goes with its voice note: unsent, removed, or its author's account or
 * consent gone.
 */

/** The voice note's payload when the event is a voice note still standing; otherwise null. */
const voiceOf = (event: Envelope | null): VoicePayload | null => {
  if (event === null || event.kind !== 'voice' || isTombstone(event.payload)) return null;
  const parsed = VoicePayload.safeParse(event.payload);
  return parsed.success ? parsed.data : null;
};

const seqParam = (c: Ctx): number | null => {
  const parsed = Seq.safeParse(Number(c.req.param('seq')));
  return parsed.success ? parsed.data : null;
};

/** The caption a row stands for now. */
async function answerFor(env: Bindings, row: CaptionRow): Promise<VoiceCaption> {
  if (row.state !== 'ready') return { state: row.state, seq: row.seq };
  const words = await getJson<CaptionWords>(env, captionKey(row.farm_id, row.seq, row.lang));
  if (words === null) return { state: 'failed', seq: row.seq };
  return VoiceCaption.parse({ state: 'ready', seq: row.seq, ...words });
}

/** Finds the voice note for a caption route; on failure, the response to send. */
async function voiceNote(c: Ctx): Promise<
  | Response
  | {
      farm: string;
      person: PersonId;
      seq: number;
      author: PersonId;
      audio: string;
    }
> {
  const m = await member(c);
  if (m instanceof Response) return m;
  const seq = seqParam(c);
  if (seq === null) return fail(c, 404, 'not_found');
  const event = await eventAt(c.env, m.farm, m.person, seq);
  const voice = voiceOf(event);
  if (event === null || voice === null || event.actor === null) {
    // Unsent or removed since: what was made from it goes too.
    if (event !== null) await dropCaptions(c.env, m.farm, seq);
    return fail(c, 404, 'not_found');
  }
  return { farm: m.farm, person: m.person, seq, author: event.actor, audio: voice.audio.key };
}

export function voiceCaptionRoutes(): Hono<SessionEnv> {
  const app = new Hono<SessionEnv>();

  app.post('/farms/:id/voice/:seq/caption', signedIn, async (c) => {
    const note = await voiceNote(c);
    if (note instanceof Response) return note;
    const asked = await body(c, VoiceCaptionRequest);
    if (asked instanceof Response) return asked;
    const { farm, seq, author, audio } = note;
    if (!(await hasConsent(c.env.DB, author, 'voice_notes'))) {
      return c.json({ state: 'not_allowed', seq } satisfies VoiceCaption);
    }
    const now = Date.now();
    if (await askCaption(c.env.DB, { farm, seq, lang: asked.lang, audio, author }, now)) {
      const job: VoiceCaptionJob = {
        kind: 'voice_caption',
        farm,
        seq,
        audio,
        author,
        lang: asked.lang,
        at: now,
      };
      try {
        await c.env.AI_QUEUE.send(job);
      } catch {
        await setCaptionState(c.env.DB, farm, seq, asked.lang, 'failed', null, now);
        return fail(c, 503, 'unavailable');
      }
    }
    const row = await captionRow(c.env.DB, farm, seq, asked.lang);
    return c.json(
      (row === null
        ? { state: 'pending', seq }
        : await answerFor(c.env, row)) satisfies VoiceCaption,
    );
  });

  app.get('/farms/:id/voice/:seq/caption', signedIn, async (c) => {
    const lang = Lang.safeParse(c.req.query('lang'));
    if (!lang.success) return fail(c, 400, 'bad_request', ['lang']);
    const note = await voiceNote(c);
    if (note instanceof Response) return note;
    if (!(await hasConsent(c.env.DB, note.author, 'voice_notes'))) {
      return c.json({ state: 'not_allowed', seq: note.seq } satisfies VoiceCaption);
    }
    const row = await captionRow(c.env.DB, note.farm, note.seq, lang.data);
    if (row === null) return fail(c, 404, 'not_found');
    return c.json((await answerFor(c.env, row)) satisfies VoiceCaption);
  });

  return app;
}

/** Someone who can read the farm's history, for the job's own look at the voice note. */
async function aReader(db: D1Database, farm: string, author: PersonId): Promise<PersonId | null> {
  const row = await db
    .prepare(
      `SELECT person_id AS person FROM memberships WHERE farm_id = ? AND left_at IS NULL
       ORDER BY person_id = ? DESC, joined_at LIMIT 1`,
    )
    .bind(farm, author)
    .first<{ person: PersonId }>();
  return row?.person ?? null;
}

const clip = (text: string) => text.slice(0, LIMITS.captionText);

/**
 * Runs a caption job. Safe to run again: a ready caption is left alone. Consent and the voice
 * note itself are read again first; without either, the caption is forgotten and nothing is sent.
 * Throws when Workers AI or R2 fails, so the queue tries again.
 */
export async function runVoiceCaption(
  env: Bindings,
  ai: AiBinding,
  job: VoiceCaptionJob,
): Promise<void> {
  const { farm, seq, lang } = job;
  const row = await captionRow(env.DB, farm, seq, lang);
  if (row === null || row.state === 'ready') return;
  if (!(await hasConsent(env.DB, job.author, 'voice_notes'))) {
    await dropCaptions(env, farm, seq);
    return;
  }
  const reader = await aReader(env.DB, farm, job.author);
  const event = reader === null ? null : await eventAt(env, farm, reader, seq);
  const voice = voiceOf(event);
  if (voice === null || voice.audio.key !== job.audio || event?.actor !== job.author) {
    await dropCaptions(env, farm, seq);
    return;
  }
  let heard: { said: string; text: string } | null = null;
  const sibling = await readySibling(env.DB, farm, seq, lang);
  if (sibling !== null) {
    heard = await getJson<CaptionWords>(env, captionKey(farm, seq, sibling.lang));
  }
  if (heard === null) {
    const object = await env.MEDIA.get(job.audio);
    if (object === null) {
      await dropCaptions(env, farm, seq);
      return;
    }
    heard = await transcribe(ai, new Uint8Array(await object.arrayBuffer()));
  }
  const text = clip(heard.text);
  if (text.trim() === '') {
    // Nothing was heard (silence, or only noise): there are no words to show.
    await setCaptionState(env.DB, farm, seq, lang, 'failed', heard.said, Date.now());
    return;
  }
  const translation =
    heard.said === lang ? null : { lang, text: clip(await translate(ai, text, heard.said, lang)) };
  const words: CaptionWords = { said: heard.said, text, translation };
  await putJson(env, captionKey(farm, seq, lang), words);
  await setCaptionState(env.DB, farm, seq, lang, 'ready', heard.said, Date.now());
}

/** A caption job that ran out of tries: shown as `failed`, which may be asked for again. */
export async function captionGaveUp(env: Bindings, job: VoiceCaptionJob): Promise<void> {
  const row = await captionRow(env.DB, job.farm, job.seq, job.lang);
  if (row?.state === 'pending') {
    await setCaptionState(env.DB, job.farm, job.seq, job.lang, 'failed', null, Date.now());
  }
}
