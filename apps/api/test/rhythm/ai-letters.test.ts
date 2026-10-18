import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

import { aiLetters, loadAi } from '../../src/rhythm/ai-letters';
import type { RecapLetterRequest, RecapLetters } from '../../src/rhythm/letters';

/*
 * The Sunday letter from the AI work's `getAiRecap`, when the Worker has it; the letters it falls
 * back on when it doesn't.
 */

const request: RecapLetterRequest = {
  farm: 'farm_ai_letters',
  week: '2054-10-18',
  lang: 'vi',
  members: ['p_one', 'p_two'],
};

/** Letters that answer `writing` and remember being asked. */
const fallback = () => {
  const asked: RecapLetterRequest[] = [];
  const letters: RecapLetters = {
    letter: (_env, r) => {
      asked.push(r);
      return Promise.resolve({ letterState: 'writing', letter: null });
    },
  };
  return { asked, letters };
};

/** A stand-in for the AI module, answering `answer` and remembering its arguments. */
const fakeAi = (answer: () => unknown) => {
  const calls: unknown[][] = [];
  let loads = 0;
  const load = () => {
    loads++;
    return Promise.resolve({
      getAiRecap: (...args: unknown[]) => {
        calls.push(args.slice(1));
        return Promise.resolve().then(answer);
      },
    });
  };
  return { calls, load, loads: () => loads };
};

const ask = (letters: RecapLetters) => letters.letter(env, request);

describe('the AI letters', () => {
  it("serve the AI's written letter, asking for the farm, the week and the reader's language", async () => {
    const letter = { lang: 'vi', title: 'Một tuần êm', body: 'Cảm ơn cả nhà.' };
    const ai = fakeAi(() => ({ letterState: 'written', letter }));
    const { asked, letters } = fallback();
    expect(await ask(aiLetters(letters, ai.load))).toEqual({ letterState: 'written', letter });
    expect(ai.calls).toEqual([[request.farm, request.week, request.lang]]);
    expect(asked).toEqual([]);
  });

  it('pass on writing and none as they are', async () => {
    const { letters } = fallback();
    const writing = fakeAi(() => ({ letterState: 'writing', letter: null }));
    expect(await ask(aiLetters(letters, writing.load))).toEqual({
      letterState: 'writing',
      letter: null,
    });
    const none = fakeAi(() => ({ letterState: 'none', letter: null }));
    expect(await ask(aiLetters(letters, none.load))).toEqual({ letterState: 'none', letter: null });
  });

  it('answer none, so the app writes its own, for an answer they cannot use or a failure', async () => {
    const { letters } = fallback();
    for (const answer of [
      () => ({ letterState: 'written', letter: null }),
      () => ({ letterState: 'writing', letter: { lang: 'en', title: 'x', body: 'y' } }),
      () => ({ letterState: 'sent', letter: null }),
      () => null,
      () => {
        throw new Error('R2 is away');
      },
    ]) {
      const ai = fakeAi(answer);
      expect(await ask(aiLetters(letters, ai.load))).toEqual({ letterState: 'none', letter: null });
    }
  });

  it('load the AI module once', async () => {
    const ai = fakeAi(() => ({ letterState: 'none', letter: null }));
    const letters = aiLetters(fallback().letters, ai.load);
    await ask(letters);
    await ask(letters);
    expect(ai.loads()).toBe(1);
  });

  it('fall back when the AI module is not part of this Worker, or has no letters', async () => {
    const missing = fallback();
    const absent = aiLetters(missing.letters, () => Promise.reject(new Error('No such module')));
    expect(await ask(absent)).toEqual({ letterState: 'writing', letter: null });
    expect(missing.asked).toEqual([request]);
    const empty = fallback();
    const other = aiLetters(empty.letters, () => Promise.resolve({ somethingElse: true }));
    expect(await ask(other)).toEqual({ letterState: 'writing', letter: null });
    expect(empty.asked).toEqual([request]);
  });

  it("load the AI work's letters", async () => {
    expect(await loadAi()).toHaveProperty('getAiRecap', expect.any(Function));
  });
});
