import { VoiceCaption, type VoiceCaptionJob } from '@kithfield/contracts';
import { createExecutionContext, createMessageBatch, getQueueResult } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { op } from '../../test/farm/support/client';
import { api, cast, type Person, plantFarm, useTestPorts } from '../../test/farm/support/doubles';
import worker from '../index';
import { TRANSLATION_MODEL, WHISPER_MODEL } from './models';
import { captionKey, sweepOwed } from './store';
import {
  consent,
  deliver,
  ScriptedAi,
  uploadVoice,
  voicePayload,
  watchAiQueue,
} from './support.test-data';

beforeEach(() => {
  useTestPorts();
});
afterEach(() => {
  vi.restoreAllMocks();
});

/** Pip sends a voice note to a farm Fig lives on; answers where it is. */
async function voiceNote(pip: Person, fig: Person) {
  const { farm, stub } = await plantFarm(pip, [fig]);
  const audio = await uploadVoice(pip, farm);
  const out = await stub.command(pip.id, {
    opId: op(1),
    kind: 'voice',
    payload: voicePayload(audio),
  });
  expect(out).toMatchObject({ result: 'ack' });
  return { farm, stub, audio, seq: (out as { seq: number }).seq };
}

const ask = async (person: Person, farm: string, seq: number, lang: string) => {
  const res = await api(person, 'POST', `/v1/farms/${farm}/voice/${seq}/caption`, { lang });
  return { status: res.status, caption: res.status === 200 ? VoiceCaption.parse(res.body) : null };
};

const look = async (person: Person, farm: string, seq: number, lang: string) => {
  const res = await api(person, 'GET', `/v1/farms/${farm}/voice/${seq}/caption?lang=${lang}`);
  return { status: res.status, caption: res.status === 200 ? VoiceCaption.parse(res.body) : null };
};

const rows = (farm: string, seq: number) =>
  env.DB.prepare('SELECT lang, state FROM voice_captions WHERE farm_id = ? AND seq = ?')
    .bind(farm, seq)
    .all<{ lang: string; state: string }>()
    .then((r) => r.results);

describe('voice-note captions', () => {
  it('never sends a voice note whose author has not said yes', async () => {
    const queued = watchAiQueue();
    const { pip, fig } = await cast('pip', 'fig');
    const { farm, seq } = await voiceNote(pip, fig);
    // Saying yes to the fire's captions is not saying yes to voice notes.
    await consent(pip, 'captions');
    await consent(pip, 'voice_notes', false);
    expect(await ask(fig, farm, seq, 'vi')).toEqual({
      status: 200,
      caption: { state: 'not_allowed', seq },
    });
    expect((await look(fig, farm, seq, 'vi')).caption).toEqual({ state: 'not_allowed', seq });
    expect(queued).toEqual([]);
    expect(await rows(farm, seq)).toEqual([]);
  });

  it('reads consent again when the job runs, and sends nothing after a no', async () => {
    const queued = watchAiQueue();
    const { pip, fig } = await cast('pip', 'fig');
    const { farm, seq } = await voiceNote(pip, fig);
    await consent(pip, 'voice_notes');
    expect((await ask(fig, farm, seq, 'en')).caption).toEqual({ state: 'pending', seq });
    expect(queued).toHaveLength(1);
    await consent(pip, 'voice_notes', false);
    const ai = new ScriptedAi();
    const outcome = await deliver(ai, queued);
    expect(outcome.explicitAcks).toHaveLength(1);
    expect(ai.calls).toEqual([]);
    expect(await rows(farm, seq)).toEqual([]);
  });

  it('captions and translates a voice note end to end, hearing it only once', async () => {
    const queued = watchAiQueue();
    const { pip, fig, bea } = await cast('pip', 'fig', 'bea');
    const { farm, seq, audio } = await voiceNote(pip, fig);
    await consent(pip, 'voice_notes');
    expect((await ask(fig, farm, seq, 'vi')).caption).toEqual({ state: 'pending', seq });
    // Asking again while it is being written queues nothing more.
    expect((await ask(fig, farm, seq, 'vi')).caption).toEqual({ state: 'pending', seq });
    expect(queued).toEqual([
      {
        kind: 'voice_caption',
        farm,
        seq,
        audio: audio.key,
        author: pip.id,
        lang: 'vi',
        at: expect.any(Number) as number,
      } satisfies VoiceCaptionJob,
    ]);

    const ai = new ScriptedAi()
      .hears('See you at the river on Saturday')
      .translates('Hẹn gặp ở bờ sông vào thứ Bảy');
    const outcome = await deliver(ai, queued);
    expect(outcome.explicitAcks).toHaveLength(1);
    const heard = ai.of(WHISPER_MODEL)[0]?.input;
    expect(typeof heard?.['audio']).toBe('string');
    expect(ai.of(TRANSLATION_MODEL)[0]?.input).toMatchObject({
      source_lang: 'en',
      target_lang: 'vi',
    });

    const ready = {
      state: 'ready',
      seq,
      said: 'en',
      text: 'See you at the river on Saturday',
      translation: { lang: 'vi', text: 'Hẹn gặp ở bờ sông vào thứ Bảy' },
    };
    expect((await look(fig, farm, seq, 'vi')).caption).toEqual(ready);
    expect((await ask(fig, farm, seq, 'vi')).caption).toEqual(ready);

    // English, the language it was said in: the transcript is reused and nothing is translated.
    expect((await ask(fig, farm, seq, 'en')).caption).toEqual({ state: 'pending', seq });
    const again = new ScriptedAi();
    await deliver(again, queued.slice(1));
    expect(again.calls).toEqual([]);
    expect((await look(fig, farm, seq, 'en')).caption).toEqual({
      state: 'ready',
      seq,
      said: 'en',
      text: 'See you at the river on Saturday',
      translation: null,
    });

    // Only people who live on the farm can ask.
    expect((await ask(bea, farm, seq, 'en')).status).toBe(404);
  });

  it('does the work once when a job is delivered twice', async () => {
    const queued = watchAiQueue();
    const { pip, fig } = await cast('pip', 'fig');
    const { farm, seq } = await voiceNote(pip, fig);
    await consent(pip, 'voice_notes');
    await ask(fig, farm, seq, 'en');
    const ai = new ScriptedAi().hears('Hello all');
    await deliver(ai, queued);
    const twice = await deliver(ai, queued);
    expect(twice.explicitAcks).toHaveLength(1);
    expect(ai.of(WHISPER_MODEL)).toHaveLength(1);
  });

  it('retries a failed job, then shows it as failed, which may be asked for again', async () => {
    const queued = watchAiQueue();
    const { pip, fig } = await cast('pip', 'fig');
    const { farm, seq } = await voiceNote(pip, fig);
    await consent(pip, 'voice_notes');
    await ask(fig, farm, seq, 'en');
    const silent = new ScriptedAi(); // answers nothing: every call fails
    expect((await deliver(silent, queued, 1)).retryMessages).toHaveLength(1);
    expect((await deliver(silent, queued, 4)).explicitAcks).toHaveLength(1);
    expect((await look(fig, farm, seq, 'en')).caption).toEqual({ state: 'failed', seq });
    expect((await ask(fig, farm, seq, 'en')).caption).toEqual({ state: 'pending', seq });
    expect(queued).toHaveLength(2);
  });

  it('purges the caption when the voice note is unsent', async () => {
    const queued = watchAiQueue();
    const { pip, fig } = await cast('pip', 'fig');
    const { farm, seq, stub } = await voiceNote(pip, fig);
    await consent(pip, 'voice_notes');
    await ask(fig, farm, seq, 'en');
    await deliver(new ScriptedAi().hears('A secret about the picnic'), queued);
    expect(await env.MEDIA.head(captionKey(farm, seq, 'en'))).not.toBeNull();

    await stub.command(pip.id, { opId: op(2), kind: 'unsend', payload: { target: seq } });
    expect(await rows(farm, seq)).toEqual([]);
    expect((await look(fig, farm, seq, 'en')).status).toBe(404);
    // The words go with the hourly sweep.
    await sweepOwed(env);
    expect(await env.MEDIA.head(captionKey(farm, seq, 'en'))).toBeNull();
  });

  it('purges the captions of a person who asks to forget, or whose account is deleted', async () => {
    const queued = watchAiQueue();
    const { pip, fig } = await cast('pip', 'fig');
    const { farm, seq } = await voiceNote(pip, fig);
    await consent(pip, 'voice_notes');
    await ask(fig, farm, seq, 'en');
    await deliver(new ScriptedAi().hears('Words to forget'), queued);
    expect(await rows(farm, seq)).toEqual([{ lang: 'en', state: 'ready' }]);

    const ctx = createExecutionContext();
    const batch = createMessageBatch('kithfield-deletion-dev', [
      {
        id: 'f1',
        timestamp: new Date(),
        attempts: 1,
        body: { kind: 'consent_forget', person: pip.id, feature: 'voice_notes', at: Date.now() },
      },
    ]);
    await worker.queue(batch, env, ctx);
    expect(((await getQueueResult(batch, ctx)) as { explicitAcks: string[] }).explicitAcks).toEqual(
      ['f1'],
    );
    expect(await rows(farm, seq)).toEqual([]);
    expect(await env.MEDIA.head(captionKey(farm, seq, 'en'))).toBeNull();

    // Saying yes again, then deleting the account.
    await consent(pip, 'voice_notes');
    await ask(fig, farm, seq, 'vi');
    await deliver(
      new ScriptedAi().hears('Words to forget').translates('Lời để quên'),
      queued.slice(1),
    );
    expect(await rows(farm, seq)).toEqual([{ lang: 'vi', state: 'ready' }]);
    const asked = Date.now() - 31 * 24 * 60 * 60_000;
    await env.DB.prepare('UPDATE people SET deleted_at = ? WHERE id = ?').bind(asked, pip.id).run();
    const purge = createMessageBatch('kithfield-deletion-dev', [
      {
        id: 'd1',
        timestamp: new Date(),
        attempts: 1,
        body: { kind: 'account_deleted', person: pip.id, at: asked },
      },
    ]);
    const purgeCtx = createExecutionContext();
    await worker.queue(purge, env, purgeCtx);
    expect(
      ((await getQueueResult(purge, purgeCtx)) as { explicitAcks: string[] }).explicitAcks,
    ).toEqual(['d1']);
    expect(await rows(farm, seq)).toEqual([]);
    await sweepOwed(env);
    expect(await env.MEDIA.head(captionKey(farm, seq, 'vi'))).toBeNull();
  });
});
