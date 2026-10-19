import type {
  Lang,
  NotificationCategory,
  PlanPushData,
  PushData,
  PushJob,
} from '@kithfield/contracts';
import { t } from '@kithfield/i18n';

import { categoryOf, notificationTypeOf, PASSIVE_COPY } from './catalogue';
import type { ExpoMessage } from './expo';
import type { AndroidChannel } from './fcm';
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

/** The plan a push asks about: its planting's seq, or null when the push is not about a plan. */
export function planSeedOf(job: Pick<PushJob, 'kind' | 'seq' | 'copy'>): number | null {
  if (job.kind === 'seed_planted') return job.seq;
  if (!job.copy.key.startsWith('push.plan')) return null;
  const seed = job.copy.params['seed'];
  return seed !== undefined && /^[1-9][0-9]{0,14}$/.test(seed) ? Number(seed) : null;
}

/**
 * The actions a long-press offers (`NOTIFICATION_ACTIONS`): `plan` for a plan that needs an
 * answer, `tend` for something a dewdrop can answer (a mention, a reply, a message, the doorstep).
 * Knocks, nudges, reminders and the quiet "a few things" pushes offer none.
 */
export function notificationCategoryOf(
  job: Pick<PushJob, 'kind' | 'seq' | 'copy' | 'farm'>,
): NotificationCategory | null {
  if (job.farm === null || PASSIVE_COPY.has(job.copy.key)) return null;
  if (planSeedOf(job) !== null) return 'plan';
  const category = categoryOf(job);
  return job.seq !== null && (category === 'mention' || category === 'doorstep') ? 'tend' : null;
}

/**
 * The Android channel a push arrives in (`14 Platforms`, two channels): every message on a farm in
 * "Every message", and everything else (plans, the doorstep, mentions, knocks, reminders) in
 * "Plans & doorstep". The quiet "a few things" roundup goes there too, drawn without a sound.
 */
export function androidChannelOf(
  job: Pick<PushJob, 'kind' | 'seq' | 'copy' | 'farm' | 'forYou'>,
): AndroidChannel {
  return notificationTypeOf(job) === 'messages' ? 'messages' : 'plans';
}

/** The copy parameter that carries who a push is from, for Android to draw their critter. */
export const FROM_PARAM = 'from';

/** Who a push is from, when it names one person: their id and the name the copy uses. */
export function senderOf(job: Pick<PushJob, 'copy'>): { person: string; name: string } | null {
  const person = job.copy.params[FROM_PARAM];
  const name = job.copy.params['name'];
  return person !== undefined && name !== undefined ? { person, name } : null;
}

/**
 * The Expo message for one device. A passive push replaces the one shown, without a sound. `id`
 * is the cottage's id for the push, sent back by the app when it is opened.
 */
export function expoMessage(
  job: PushJob,
  push: RenderedPush,
  token: string,
  id: string,
): ExpoMessage {
  const base: PushData = { farm: job.farm, seq: job.seq, kind: job.kind, push: id };
  const category = notificationCategoryOf(job);
  const seed = planSeedOf(job);
  const data: PushData | PlanPushData =
    category === 'plan' && seed !== null ? { ...base, seed } : base;
  return {
    to: token,
    title: push.title,
    body: push.body,
    data,
    ...(push.passive ? {} : { sound: 'default' as const }),
    collapseId: job.collapseKey,
    tag: job.collapseKey,
    threadId: job.farm ?? 'kithfield',
    interruptionLevel: push.passive ? 'passive' : 'active',
    priority: push.passive ? 'normal' : 'high',
    // A knock is live for a minute; after that it must not arrive at all.
    ttl: job.kind === 'knock' ? KNOCK_LIFETIME_MS / 1000 : TTL_SECONDS,
    ...(category === null ? {} : { categoryId: category }),
    // The extension puts the farm's or the seed's still on it; never a badge.
    ...(job.farm === null ? {} : { mutableContent: true as const }),
  };
}
