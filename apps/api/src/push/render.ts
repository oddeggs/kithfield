import type { Lang, PushJob } from '@kithfield/contracts';
import { t } from '@kithfield/i18n';

import { PASSIVE_COPY } from './catalogue';
import type { ExpoMessage } from './expo';
import { KNOCK_LIFETIME_MS } from './policy';

/** A push lives a day at most: after that it would arrive stale. */
const TTL_SECONDS = 24 * 60 * 60;

/** `t` for copy keys that arrive as data on a job, checked when rendered rather than typed. */
const lookup = t as unknown as (
  language: Lang,
  key: string,
  params?: Readonly<Record<string, string>>,
) => string;

export interface RenderedPush {
  readonly title: string;
  readonly body: string;
  readonly passive: boolean;
}

/**
 * A job's copy in the person's language, or null when the copy key is not in the catalogue. A
 * name the cottage didn't know reads "A friend".
 * The title is the farm's name, or the app's for a push with no farm.
 */
export function renderPush(job: PushJob, lang: Lang, title: string | null): RenderedPush | null {
  const params = {
    ...job.copy.params,
    name: job.copy.params['name'] ?? lookup(lang, 'push.aFriend'),
  };
  const body = lookup(lang, job.copy.key, params);
  if (body === job.copy.key) return null;
  return {
    title: title ?? lookup(lang, 'push.app'),
    body,
    passive: PASSIVE_COPY.has(job.copy.key),
  };
}

/** The Expo message for one device. A passive push replaces the one shown, without a sound. */
export function expoMessage(job: PushJob, push: RenderedPush, token: string): ExpoMessage {
  return {
    to: token,
    title: push.title,
    body: push.body,
    data: { farm: job.farm, seq: job.seq, kind: job.kind },
    ...(push.passive ? {} : { sound: 'default' as const }),
    collapseId: job.collapseKey,
    tag: job.collapseKey,
    threadId: job.farm ?? 'kithfield',
    interruptionLevel: push.passive ? 'passive' : 'active',
    priority: push.passive ? 'normal' : 'high',
    // A knock is live for a minute; after that it must not arrive at all.
    ttl: job.kind === 'knock' ? KNOCK_LIFETIME_MS / 1000 : TTL_SECONDS,
  };
}
