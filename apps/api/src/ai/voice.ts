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

import { eitherBlocked, type SessionEnv } from '../auth';
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
  claimTranscript,
  dropCaptions,
  finishTranscript,
  getJson,
  type Heard,
  putJson,
  releaseTranscript,
  settleCaption,
  transcriptKey,
  transcriptRow,
} from './store';

/*
 * Voice-note captions. A friend asks for one in their language (`POST
 * /v1/farms/:id/voice/:seq/caption {lang}`); if the voice note's author said yes to
 * `voice_notes`, a `VoiceCaptionJob` goes on the `ai` queue and the answer is `pending` until it
 * is `ready` (`GET` the same path with `?lang=`). Whisper hears it once; another language only
 * translates. A caption goes with its voice note: unsent, removed, or its author's account or
 * consent gone. A forwarded voice note is never captioned: its voice is someone else's, who never
 * said yes here. Nothing is captioned between two people where either blocked the other.
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
  // Nothing was heard: shown as failed, and never heard again.
  if (row.state === 'silent') return { state: 'failed', seq: row.seq };
  if (row.state !== 'ready') return { state: row.state, seq: row.seq };
  const words = await getJson<CaptionWords>(env, captionKey(row.farm_id, row.seq, row.lang));
  if (words === null) return { state: 'failed', seq: row.seq };
  return VoiceCaption.parse({ state: 'ready', seq: row.seq, ...words });
}

type Note = {
  farm: string;
  person: PersonId;
  seq: number;
  author: PersonId;
  audio: string;
  /** Never captioned here: forwarded, the author said no, or a block between the two. */
  refused: boolean;
};

/** Finds the voice note for a caption route; on failure, the response to send. */
async function voiceNote(c: Ctx): Promise<Response | Note> {
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
  const author = event.actor;
  const refused =
    voice.forwardedFrom !== undefined ||
    !(await hasConsent(c.env.DB, author, 'voice_notes')) ||
    (m.person !== author && (await eitherBlocked(c.env.DB, m.person, author)));
  return { farm: m.farm, person: m.person, seq, author, audio: voice.audio.key, refused };
}

/** Asking for captions is limited per person and per farm; false (answer 429) once over. */
const withinLimits = async (c: Ctx, note: Note): Promise<boolean> =>
  (await c.env.AI_LIMIT.limit({ key: note.person })).success &&
  (await c.env.AI_FARM_LIMIT.limit({ key: note.farm })).success;

export function voiceCaptionRoutes(): Hono<SessionEnv> {
  const app = new Hono<SessionEnv>();

  app.post('/farms/:id/voice/:seq/caption', signedIn, async (c) => {
    const note = await voiceNote(c);
    if (note instanceof Response) return note;
    const asked = await body(c, VoiceCaptionRequest);
    if (asked instanceof Response) return asked;
    const { farm, seq, author, audio } = note;
    if (note.refused) return c.json({ state: 'not_allowed', seq } satisfies VoiceCaption);
    if (!(await withinLimits(c, note))) return fail(c, 429, 'rate_limited');
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
        await settleCaption(c.env.DB, farm, seq, asked.lang, 'failed', null, now);
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
    if (note.refused) return c.json({ state: 'not_allowed', seq: note.seq } satisfies VoiceCaption);
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

/** Another job is hearing this voice note right now; this one waits and tries again. */
export class HearingElsewhere extends Error {
  constructor() {
    super('another job is hearing this voice note');
  }
}

/** A claim on hearing a voice note older than this was left by a job that died. */
const CLAIM_MS = 5 * 60_000;

/** Whether the job's voice note is still one to caption: there, not forwarded, and theirs. */
async function stillCaptionable(env: Bindings, job: VoiceCaptionJob): Promise<boolean> {
  if (!(await hasConsent(env.DB, job.author, 'voice_notes'))) return false;
  const reader = await aReader(env.DB, job.farm, job.author);
  const event = reader === null ? null : await eventAt(env, job.farm, reader, job.seq);
  const voice = voiceOf(event);
  return (
    voice !== null &&
    voice.forwardedFrom === undefined &&
    voice.audio.key === job.audio &&
    event?.actor === job.author
  );
}

/**
 * What the voice note says: heard once and kept for every language. `silent` when there is
 * nothing to show (final); `gone` when it was forgotten meanwhile. Throws `HearingElsewhere`
 * while another job holds the claim.
 */
async function hear(
  env: Bindings,
  ai: AiBinding,
  job: VoiceCaptionJob,
): Promise<Heard | 'silent' | 'gone'> {
  const { farm, seq } = job;
  const known = await transcriptRow(env.DB, farm, seq);
  if (known?.state === 'silent') return 'silent';
  if (known?.state === 'heard') {
    const words = await getJson<Heard>(env, transcriptKey(farm, seq));
    if (words !== null) return words;
  }
  const now = Date.now();
  const claim = await claimTranscript(
    env.DB,
    { farm, seq, audio: job.audio, author: job.author },
    now,
    now - CLAIM_MS,
  );
  if (claim === null) throw new HearingElsewhere();
  const object = await env.MEDIA.get(job.audio);
  if (object === null) {
    await dropCaptions(env, farm, seq);
    return 'gone';
  }
  if (object.size > LIMITS.uploadBytes) {
    // Larger than any upload may be: never read, never sent.
    await object.body.cancel();
    await finishTranscript(env.DB, farm, seq, claim, 'silent', 'und');
    return 'silent';
  }
  let heard: Heard;
  try {
    heard = await transcribe(ai, new Uint8Array(await object.arrayBuffer()));
  } catch (error) {
    await releaseTranscript(env.DB, farm, seq, claim);
    throw error;
  }
  const text = clip(heard.text);
  if (text.trim() === '') {
    // Nothing was heard (silence, or only noise): final, so it is never sent again.
    await finishTranscript(env.DB, farm, seq, claim, 'silent', heard.said);
    return 'silent';
  }
  // Consent may have been withdrawn while Whisper listened: then nothing is kept.
  if (!(await hasConsent(env.DB, job.author, 'voice_notes'))) {
    await dropCaptions(env, farm, seq);
    return 'gone';
  }
  const held = await transcriptRow(env.DB, farm, seq);
  if (held === null) return 'gone';
  if (held.claimed_at !== claim) throw new HearingElsewhere();
  const words: Heard = { said: heard.said, text };
  await putJson(env, transcriptKey(farm, seq), words);
  if (!(await finishTranscript(env.DB, farm, seq, claim, 'heard', heard.said))) {
    // Forgotten (or taken over) between the check and the write: the words go.
    await env.MEDIA.delete(transcriptKey(farm, seq));
    return 'gone';
  }
  return words;
}

/**
 * Runs a caption job. Safe to run again: only a pending caption is worked on. Consent and the voice
 * note itself are read again first; without either, the caption is forgotten and nothing is sent.
 * Every write is checked against the index afterwards, so words written for a caption forgotten
 * meanwhile are deleted again. Throws when Workers AI or R2 fails, so the queue tries again.
 */
export async function runVoiceCaption(
  env: Bindings,
  ai: AiBinding,
  job: VoiceCaptionJob,
): Promise<void> {
  const { farm, seq, lang } = job;
  const row = await captionRow(env.DB, farm, seq, lang);
  if (row?.state !== 'pending') return;
  if (!(await stillCaptionable(env, job))) {
    await dropCaptions(env, farm, seq);
    return;
  }
  const heard = await hear(env, ai, job);
  if (heard === 'gone') return;
  if (heard === 'silent') {
    await settleCaption(env.DB, farm, seq, lang, 'silent', null, Date.now());
    return;
  }
  const translation =
    heard.said === lang
      ? null
      : { lang, text: clip(await translate(ai, heard.text, heard.said, lang)) };
  if (!(await hasConsent(env.DB, job.author, 'voice_notes'))) {
    await dropCaptions(env, farm, seq);
    return;
  }
  if ((await captionRow(env.DB, farm, seq, lang))?.state !== 'pending') return;
  const key = captionKey(farm, seq, lang);
  await putJson(env, key, { ...heard, translation } satisfies CaptionWords);
  if (!(await settleCaption(env.DB, farm, seq, lang, 'ready', heard.said, Date.now()))) {
    await env.MEDIA.delete(key);
  }
}

/** A caption job that ran out of tries: shown as `failed`, which may be asked for again. */
export async function captionGaveUp(env: Bindings, job: VoiceCaptionJob): Promise<void> {
  await settleCaption(env.DB, job.farm, job.seq, job.lang, 'failed', null, Date.now());
}
