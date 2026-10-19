import { type PushJob, TOGETHER_ASK_PUSH } from '@kithfield/contracts';

import type { Bindings } from '../env';
import { cottageOf } from '../cottage/stub';
import { tag } from '../push/catalogue';
import { displayNameOf } from '../push/names';

/*
 * A friend asking to take a together sticker with you in it out of Kithfield: one push, the first
 * time they ask, through your cottage like any other, so it counts against the farm's day. Once
 * that day's pushes are spent it folds into the farm's "a few things" push, and the ask waits in
 * Settings, under Stickers with you in them.
 */

export const TOGETHER_ASK_COPY = 'push.togetherAsk';

export function togetherAskJob(
  subject: string,
  ask: { readonly asker: string; readonly farm: string; readonly at: number },
  name: string | null,
): PushJob {
  return {
    person: subject,
    farm: ask.farm,
    kind: TOGETHER_ASK_PUSH,
    seq: null,
    collapseKey: `together.${tag(ask.asker)}.${tag(ask.farm)}`,
    copy: { key: TOGETHER_ASK_COPY, params: name === null ? {} : { name } },
    forYou: true,
    at: ask.at,
  };
}

/** Tells each friend asked for the first time; a push that can't be made never fails the ask. */
export async function pushAsks(
  env: Bindings,
  ask: { readonly asker: string; readonly farm: string; readonly at: number },
  subjects: readonly string[],
): Promise<void> {
  if (subjects.length === 0) return;
  const name = await displayNameOf(env.DB, ask.asker).catch(() => null);
  await Promise.all(
    subjects.map((subject) =>
      cottageOf(env, subject)
        .push(togetherAskJob(subject, ask, name))
        .catch((error: unknown) => {
          console.error('together ask push failed', { error: String(error) });
        }),
    ),
  );
}
