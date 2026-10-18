import { VoiceCaption } from '@kithfield/contracts';
import { createExecutionContext, createMessageBatch, getQueueResult } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { expect, vi } from 'vitest';

import { op } from '../../test/farm/support/client';
import { api, type Person, plantFarm } from '../../test/farm/support/doubles';
import type { Bindings } from '../env';
import worker from '../index';
import { bytesOf, put, uploadUrl } from '../media/support.test-data';
import { AI_CONSENT_TEXT_VERSION } from './consent';
import { RECAP_MODEL, TRANSLATION_MODEL, WHISPER_MODEL } from './models';

/*
 * Shared steps for the AI tests. Workers AI is the one stand-in: a binding that answers what each
 * test scripts and records what it was sent. Everything else is the real API.
 */

export type AiCall = { model: string; input: Record<string, unknown> };

/** A stand-in for the `AI` binding: per model, the answers it gives in turn. */
export class ScriptedAi {
  readonly calls: AiCall[] = [];
  private readonly answers = new Map<string, unknown[]>();

  answer(model: string, ...answers: unknown[]): this {
    this.answers.set(model, [...(this.answers.get(model) ?? []), ...answers]);
    return this;
  }

  hears(text: string, language = 'en', meanwhile?: () => Promise<void>): this {
    const heard = { text, transcription_info: { language } };
    return this.answer(
      WHISPER_MODEL,
      meanwhile === undefined ? heard : () => meanwhile().then(() => heard),
    );
  }

  translates(text: string): this {
    return this.answer(TRANSLATION_MODEL, { translated_text: text });
  }

  writes(...letters: { title: string; body: string }[]): this {
    return this.answer(
      RECAP_MODEL,
      ...letters.map((l) => ({ choices: [{ message: { content: JSON.stringify(l) } }] })),
    );
  }

  of(model: string): AiCall[] {
    return this.calls.filter((c) => c.model === model);
  }

  readonly run = (model: string, input: Record<string, unknown>): Promise<unknown> => {
    this.calls.push({ model, input });
    const next = this.answers.get(model)?.shift();
    if (next === undefined) return Promise.reject(new Error(`no answer scripted for ${model}`));
    // An answer may be work to do while the model "runs", answering what to send back.
    return typeof next === 'function'
      ? Promise.resolve((next as () => unknown)())
      : Promise.resolve(next);
  };
}

/** The real bindings with Workers AI swapped for the stand-in. */
export const withAi = (ai: ScriptedAi): Bindings =>
  new Proxy(env, {
    get: (target, key) =>
      key === 'AI' ? ai : (target as unknown as Record<string | symbol, unknown>)[key],
  });

/** Records what goes on the `ai` queue instead of sending it to the local queue. */
export const watchAiQueue = () => {
  const sent: unknown[] = [];
  vi.spyOn(env.AI_QUEUE, 'send').mockImplementation((body) => {
    sent.push(body);
    return Promise.resolve({ metadata: {} } as unknown as QueueSendResponse);
  });
  vi.spyOn(env.AI_QUEUE, 'sendBatch').mockImplementation((messages) => {
    for (const m of messages) sent.push(m.body);
    return Promise.resolve({ metadata: {} } as unknown as QueueSendBatchResponse);
  });
  return sent;
};

let messages = 0;

/** Delivers jobs on the `ai` queue through the Worker's queue handler; answers the outcome. */
export async function deliver(ai: ScriptedAi, bodies: unknown[], attempts = 1) {
  const batch = createMessageBatch(
    'kithfield-ai-dev',
    bodies.map((body) => ({
      id: `ai${(messages++).toString()}`,
      timestamp: new Date(),
      attempts,
      body,
    })),
  );
  const ctx = createExecutionContext();
  await worker.queue(batch, withAi(ai), ctx);
  return (await getQueueResult(batch, ctx)) as unknown as {
    explicitAcks: string[];
    retryMessages: { msgId: string }[];
  };
}

export const consent = async (person: Person, feature: string, allowed = true) => {
  const res = await api(person, 'PUT', `/v1/me/consents/${feature}`, {
    allowed,
    textVersion: AI_CONSENT_TEXT_VERSION,
  });
  expect(res.status).toBe(204);
};

/** A short voice note uploaded by `person` to `farm`; answers its media ref. */
export const uploadVoice = async (person: Person, farm: string, length = 4096) => {
  const target = await uploadUrl(person, { farm, kind: 'voice', bytes: length, mime: 'audio/aac' });
  if (target.upload !== 'single') throw new Error('expected a single upload');
  expect((await put(target.url, bytesOf(length), 'audio/aac')).status).toBe(200);
  return { key: target.key, mime: 'audio/aac', bytes: length, durationMs: 3000 };
};

export const voicePayload = (audio: Awaited<ReturnType<typeof uploadVoice>>) => ({
  audio,
  durationMs: 3000,
  waveform: [10, 80, 40],
});

/** A voice note as a forward: the same audio, said to come from another farm. */
export const forwarded = (audio: Awaited<ReturnType<typeof uploadVoice>>) => ({
  ...voicePayload(audio),
  forwardedFrom: { farm: 'elsewhere0000000000000', seq: 7 },
});

/** Pip sends a voice note (or forwards one) to a farm the others live on; answers where it is. */
export async function voiceNote(pip: Person, others: Person[], how: 'said' | 'forwarded' = 'said') {
  const { farm, stub } = await plantFarm(pip, others);
  const audio = await uploadVoice(pip, farm);
  const out = await stub.command(pip.id, {
    opId: op(1),
    kind: 'voice',
    payload: how === 'said' ? voicePayload(audio) : forwarded(audio),
  });
  expect(out).toMatchObject({ result: 'ack' });
  return { farm, stub, audio, seq: (out as { seq: number }).seq };
}

export const ask = async (person: Person, farm: string, seq: number, lang: string) => {
  const res = await api(person, 'POST', `/v1/farms/${farm}/voice/${seq}/caption`, { lang });
  return { status: res.status, caption: res.status === 200 ? VoiceCaption.parse(res.body) : null };
};

export const look = async (person: Person, farm: string, seq: number, lang: string) => {
  const res = await api(person, 'GET', `/v1/farms/${farm}/voice/${seq}/caption?lang=${lang}`);
  return { status: res.status, caption: res.status === 200 ? VoiceCaption.parse(res.body) : null };
};

/** Every object the AI keeps for a voice note. */
export const wordsOf = async (farm: string, seq: number) =>
  (await env.MEDIA.list({ prefix: `ai/voice/${farm}/${seq}/` })).objects.map((o) => o.key);

export const rows = (farm: string, seq: number) =>
  env.DB.prepare('SELECT lang, state FROM voice_captions WHERE farm_id = ? AND seq = ?')
    .bind(farm, seq)
    .all<{ lang: string; state: string }>()
    .then((r) => r.results);
