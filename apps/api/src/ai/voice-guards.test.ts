import { LIMITS, type VoiceCaptionJob } from '@kithfield/contracts';
import { env } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { op } from '../../test/farm/support/client';
import { api, cast, useTestPorts } from '../../test/farm/support/doubles';
import { WHISPER_MODEL } from './models';
import { claimTranscript, dropCaptionsBy, sweepOwed } from './store';
import {
  ask,
  consent,
  deliver,
  look,
  rows,
  ScriptedAi,
  voiceNote,
  watchAiQueue,
  wordsOf,
} from './support.test-data';

/* Who may never be captioned or ask, and the words that must never be left behind. */

beforeEach(() => {
  useTestPorts();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('a voice note that is never captioned', () => {
  it('never captions a forwarded voice note: its voice said yes nowhere here', async () => {
    const queued = watchAiQueue();
    const { pip, fig } = await cast('pip', 'fig');
    const { farm, seq, audio } = await voiceNote(pip, [fig], 'forwarded');
    await consent(pip, 'voice_notes');
    expect((await ask(fig, farm, seq, 'en')).caption).toEqual({ state: 'not_allowed', seq });
    expect((await look(fig, farm, seq, 'en')).caption).toEqual({ state: 'not_allowed', seq });
    expect(queued).toEqual([]);

    // A job for it, however it got queued, is dropped without hearing anything.
    await env.DB.prepare(
      `INSERT INTO voice_captions (farm_id, seq, lang, audio_key, author_id, state, asked_at, updated_at)
       VALUES (?, ?, 'en', ?, ?, 'pending', 1, 1)`,
    )
      .bind(farm, seq, audio.key, pip.id)
      .run();
    const job: VoiceCaptionJob = {
      kind: 'voice_caption',
      farm,
      seq,
      audio: audio.key,
      author: pip.id,
      lang: 'en',
      at: 1,
    };
    const ai = new ScriptedAi().hears('Someone else’s voice');
    await deliver(ai, [job]);
    expect(ai.calls).toEqual([]);
    expect(await rows(farm, seq)).toEqual([]);
  });

  it('takes a yes only to the consent words in force', async () => {
    const queued = watchAiQueue();
    const { pip, fig } = await cast('pip', 'fig');
    const { farm, seq } = await voiceNote(pip, [fig]);
    await api(pip, 'PUT', '/v1/me/consents/voice_notes', {
      allowed: true,
      textVersion: '2026-10-18',
    });
    expect((await ask(fig, farm, seq, 'en')).caption).toEqual({ state: 'not_allowed', seq });
    expect(queued).toEqual([]);
  });
});

describe('who may ask', () => {
  it('turns away a visitor, a member who left and someone blocked', async () => {
    const queued = watchAiQueue();
    const { pip, fig, bea, mo } = await cast('pip', 'fig', 'bea', 'mo');
    const { farm, seq, stub } = await voiceNote(pip, [fig, bea]);
    await consent(pip, 'voice_notes');

    // Mo never lived here.
    expect((await ask(mo, farm, seq, 'en')).status).toBe(404);
    expect((await look(mo, farm, seq, 'en')).status).toBe(404);

    // Bea left.
    await stub.command(bea.id, { opId: op(5), kind: 'left', payload: {} });
    expect((await ask(bea, farm, seq, 'en')).status).toBe(404);
    expect((await look(bea, farm, seq, 'en')).status).toBe(404);

    // Fig blocked Pip: nothing of Pip's is captioned for Fig, and the block isn't told.
    expect((await api(fig, 'PUT', `/v1/blocks/${pip.id}`)).status).toBeLessThan(300);
    expect((await ask(fig, farm, seq, 'en')).caption).toEqual({ state: 'not_allowed', seq });
    expect((await look(fig, farm, seq, 'en')).caption).toEqual({ state: 'not_allowed', seq });
    expect(queued).toEqual([]);
  });

  it('limits asking per person and per farm', async () => {
    const queued = watchAiQueue();
    const { pip, fig } = await cast('pip', 'fig');
    const { farm, seq } = await voiceNote(pip, [fig]);
    await consent(pip, 'voice_notes');
    const person = vi.spyOn(env.AI_LIMIT, 'limit').mockResolvedValue({ success: false });
    expect((await ask(fig, farm, seq, 'en')).status).toBe(429);
    expect(person).toHaveBeenCalledWith({ key: fig.id });
    person.mockResolvedValue({ success: true });
    const perFarm = vi.spyOn(env.AI_FARM_LIMIT, 'limit').mockResolvedValue({ success: false });
    expect((await ask(fig, farm, seq, 'en')).status).toBe(429);
    expect(perFarm).toHaveBeenCalledWith({ key: farm });
    expect(queued).toEqual([]);
  });
});

describe('hearing a voice note once', () => {
  it('shares one Whisper run between languages asked at once', async () => {
    const queued = watchAiQueue();
    const { pip, fig } = await cast('pip', 'fig');
    const { farm, seq, audio } = await voiceNote(pip, [fig]);
    await consent(pip, 'voice_notes');
    await ask(fig, farm, seq, 'en');
    await ask(fig, farm, seq, 'vi');
    // The Vietnamese job is hearing it right now.
    const now = Date.now();
    await claimTranscript(
      env.DB,
      { farm, seq, audio: audio.key, author: pip.id },
      now,
      now - 60_000,
    );
    const ai = new ScriptedAi().hears('Hello');
    const waiting = await deliver(ai, queued.slice(0, 1));
    expect(waiting.retryMessages).toHaveLength(1);
    expect(ai.of(WHISPER_MODEL)).toEqual([]);
    expect((await look(fig, farm, seq, 'en')).caption).toEqual({ state: 'pending', seq });
  });

  it('keeps "nothing heard" as final, never sent to Whisper again', async () => {
    const queued = watchAiQueue();
    const { pip, fig } = await cast('pip', 'fig');
    const { farm, seq } = await voiceNote(pip, [fig]);
    await consent(pip, 'voice_notes');
    await ask(fig, farm, seq, 'en');
    const ai = new ScriptedAi().hears('   ');
    await deliver(ai, queued);
    expect((await look(fig, farm, seq, 'en')).caption).toEqual({ state: 'failed', seq });
    expect((await ask(fig, farm, seq, 'en')).caption).toEqual({ state: 'failed', seq });
    // Another language reads the same silence without hearing it again.
    await ask(fig, farm, seq, 'vi');
    const again = new ScriptedAi();
    await deliver(again, queued.slice(1));
    expect(again.calls).toEqual([]);
    expect((await look(fig, farm, seq, 'vi')).caption).toEqual({ state: 'failed', seq });
    expect(queued).toHaveLength(2);
    expect(await wordsOf(farm, seq)).toEqual([]);
  });

  it('never reads an object larger than an upload may be', async () => {
    const queued = watchAiQueue();
    const { pip, fig } = await cast('pip', 'fig');
    const { farm, seq } = await voiceNote(pip, [fig]);
    await consent(pip, 'voice_notes');
    await ask(fig, farm, seq, 'en');
    const cancel = vi.fn(() => Promise.resolve());
    vi.spyOn(env.MEDIA, 'get').mockResolvedValue({
      size: LIMITS.uploadBytes + 1,
      body: { cancel },
    } as unknown as R2ObjectBody);
    const ai = new ScriptedAi().hears('never');
    await deliver(ai, queued);
    expect(ai.calls).toEqual([]);
    expect(cancel).toHaveBeenCalled();
    expect((await look(fig, farm, seq, 'en')).caption).toEqual({ state: 'failed', seq });
  });
});

describe('no words left behind', () => {
  it('keeps nothing when consent is withdrawn while Whisper listens', async () => {
    const queued = watchAiQueue();
    const { pip, fig } = await cast('pip', 'fig');
    const { farm, seq } = await voiceNote(pip, [fig]);
    await consent(pip, 'voice_notes');
    await ask(fig, farm, seq, 'vi');
    const ai = new ScriptedAi()
      .hears('Words said', 'en', async () => {
        await consent(pip, 'voice_notes', false);
        await dropCaptionsBy(env, pip.id);
      })
      .translates('never');
    expect((await deliver(ai, queued)).explicitAcks).toHaveLength(1);
    expect(await rows(farm, seq)).toEqual([]);
    expect(await wordsOf(farm, seq)).toEqual([]);
  });

  it('deletes words written just as the caption was forgotten', async () => {
    const queued = watchAiQueue();
    const { pip, fig } = await cast('pip', 'fig');
    const { farm, seq } = await voiceNote(pip, [fig]);
    await consent(pip, 'voice_notes');
    await ask(fig, farm, seq, 'en');
    // The forget lands just as the transcript is written, after the job's last look.
    const put = env.MEDIA.put.bind(env.MEDIA);
    vi.spyOn(env.MEDIA, 'put').mockImplementation(async (key, value, options) => {
      await dropCaptionsBy(env, pip.id);
      return put(key, value, options);
    });
    await deliver(new ScriptedAi().hears('Words said'), queued);
    expect(await rows(farm, seq)).toEqual([]);
    expect(await wordsOf(farm, seq)).toEqual([]);
  });

  it('purges the captions when the voice note is quarantined or held by the safety team', async () => {
    const queued = watchAiQueue();
    const { pip, fig } = await cast('pip', 'fig');
    const { farm, seq, audio } = await voiceNote(pip, [fig]);
    await consent(pip, 'voice_notes');
    await ask(fig, farm, seq, 'en');
    await deliver(new ScriptedAi().hears('Words said'), queued);
    expect(await wordsOf(farm, seq)).toHaveLength(2);
    await env.DB.prepare(
      "UPDATE media_objects SET quarantined_at = ?, quarantined_by = 'ana' WHERE key = ?",
    )
      .bind(Date.now(), audio.key)
      .run();
    expect(await rows(farm, seq)).toEqual([]);
    await sweepOwed(env);
    expect(await wordsOf(farm, seq)).toEqual([]);
  });
});
