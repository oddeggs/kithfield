import { type Lang, WeeklyRecap } from '@kithfield/contracts';

import type { Bindings } from '../env';
import type { RecapLetter, RecapLetters } from './letters';

/*
 * The Sunday letter from the AI work's `getAiRecap(env, farm, week, lang?)` (`src/ai`), loaded on
 * first use. While this Worker is built without that module the letters fall back to `fallback`;
 * once it is, an answer this server can't serve becomes `none`, so the app writes its own letter.
 */

type AiModule = {
  getAiRecap: (env: Bindings, farm: string, week: string, lang?: Lang) => Promise<unknown>;
};

/** Loads the AI work's module. To switch its letters on once it is merged: `import('../ai')`. */
export const loadAi = (): Promise<unknown> => import(/* @vite-ignore */ ['..', 'ai'].join('/'));

const isAiModule = (module: unknown): module is AiModule =>
  typeof (module as Partial<AiModule> | null)?.getAiRecap === 'function';

const NONE: RecapLetter = { letterState: 'none', letter: null };

/** The AI's answer as the recap serves it, checked as `WeeklyRecap` checks it; else `none`. */
const letterOf = (request: { farm: string; week: string }, answer: unknown): RecapLetter => {
  const { letterState, letter } = (answer ?? {}) as Partial<RecapLetter>;
  const recap = WeeklyRecap.safeParse({
    farm: request.farm,
    week: request.week,
    pollinator: null,
    thanks: [],
    plans: [],
    letterState,
    letter,
  });
  if (!recap.success) {
    console.error('recap letter unusable', { issues: recap.error.issues.length });
    return NONE;
  }
  return { letterState: recap.data.letterState, letter: recap.data.letter };
};

/** Letters from the AI module that `load` finds (once per isolate), or `fallback`'s without it. */
export const aiLetters = (
  fallback: RecapLetters,
  load: () => Promise<unknown> = loadAi,
): RecapLetters => {
  let found: Promise<AiModule | null> | null = null;
  const ai = () =>
    (found ??= load().then(
      (module) => (isAiModule(module) ? module : null),
      () => null,
    ));
  return {
    async letter(env, request) {
      const module = await ai();
      if (module === null) return fallback.letter(env, request);
      try {
        return letterOf(
          request,
          await module.getAiRecap(env, request.farm, request.week, request.lang),
        );
      } catch (error) {
        console.error('recap letter unavailable', {
          error: error instanceof Error ? error.message : 'unknown',
        });
        return NONE;
      }
    },
  };
};
