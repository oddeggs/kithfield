import { createExecutionContext, createMessageBatch, getQueueResult } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { expect, vi } from 'vitest';

import { api, type Person } from '../../test/farm/support/doubles';
import type { Bindings } from '../env';
import worker from '../index';
import { bytesOf, put, uploadUrl } from '../media/support.test-data';
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

  hears(text: string, language = 'en'): this {
    return this.answer(WHISPER_MODEL, { text, transcription_info: { language } });
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
    return Promise.resolve(next);
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
    textVersion: '2026-10-19',
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
