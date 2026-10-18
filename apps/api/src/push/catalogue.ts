import type {
  CottageDelivery,
  FarmNotifications,
  NotificationType,
  PushJob,
} from '@kithfield/contracts';

import type { PushCategory } from './policy';

/*
 * Which events become pushes, under which copy, from the notification catalogue in
 * `10 On the System`. Copy keys name entries in the `push` i18n catalogue; the consumer renders
 * them in the person's language.
 */

/** Gifts and letters left on the person's step: one push a day, bundled. */
const DOORSTEP_COPY: Readonly<Record<string, string>> = {
  firefly: 'push.doorstep.firefly',
  gift: 'push.doorstep.gift',
  slow_post: 'push.doorstep.slowPost',
};

/** Kinds with words: meant for the person, they are a mention or a reply. */
const CHAT_KINDS = new Set(['message', 'link', 'quiet_note', 'media', 'voice', 'sticker']);

/** The "a few things" copy that replaces a day's pushes once the budget is spent. */
export const FEW_COPY = {
  doorstep: 'push.doorstep.few',
  farm: 'push.farm.few',
} as const;

/** Copy keys sent quietly: they replace a push already on the lock screen without a sound. */
export const PASSIVE_COPY: ReadonlySet<string> = new Set(Object.values(FEW_COPY));

export const NUDGE_LAST_COPY = 'push.nudge.last';
export const REMEMBER_COPY = 'push.remember';

/** A push the cottage is about to decide on. */
export interface Candidate {
  readonly category: PushCategory;
  readonly copyKey: string;
  /** Whether the copy names the actor (`{name}`), so the cottage looks the name up. */
  readonly named: boolean;
}

/**
 * The push an event would make for this person, or null when it makes none. The person's own
 * events never push them. Who moved in pushes everyone; the rest only the person they are for,
 * unless they asked for every message on this farm.
 */
export function candidateFor(
  delivery: CottageDelivery,
  person: string,
  everyMessage = false,
): Candidate | null {
  if (delivery.actor === person) return null;
  if (delivery.kind === 'joined' && delivery.actor !== null) {
    return { category: 'farm', copyKey: 'push.joined', named: true };
  }
  if (!delivery.forYou) {
    // Every message, for someone who turned that on for this farm (11-08, off by default).
    return everyMessage && CHAT_KINDS.has(delivery.kind) && delivery.preview !== null
      ? { category: 'mention', copyKey: 'push.mention', named: true }
      : null;
  }
  const doorstep = DOORSTEP_COPY[delivery.kind];
  if (doorstep !== undefined) return { category: 'doorstep', copyKey: doorstep, named: true };
  if (delivery.kind === 'knock') return { category: 'knock', copyKey: 'push.knock', named: true };
  if (CHAT_KINDS.has(delivery.kind) && delivery.preview !== null) {
    return { category: 'mention', copyKey: 'push.mention', named: true };
  }
  // The rest wait on the doorstep and in Quick Tend; the catalogue has no push for them.
  return null;
}

/** A job's category, read from its kind and copy, for jobs other producers hand the cottage. */
export function categoryOf(job: Pick<PushJob, 'kind' | 'copy' | 'farm'>): PushCategory {
  if (job.copy.key === REMEMBER_COPY) return 'reminder';
  if (job.kind.startsWith('nudge') || job.farm === null) return 'nudge';
  if (job.kind === 'knock') return 'knock';
  if (job.copy.key === FEW_COPY.doorstep) return 'doorstep';
  if (job.copy.key === FEW_COPY.farm) return 'farm';
  if (Object.values(DOORSTEP_COPY).includes(job.copy.key)) return 'doorstep';
  if (job.copy.key === 'push.mention') return 'mention';
  return 'farm';
}

/** Kinds and copy that make a plan push ("Plans that need your yes"). */
const PLAN_KINDS = new Set(['seed_planted', 'seed_changed', 'vote', 'rsvp', 'checkin']);
const isPlanPush = (job: Pick<PushJob, 'kind' | 'copy'>) =>
  PLAN_KINDS.has(job.kind) ||
  job.copy.key.startsWith('push.plan') ||
  job.copy.key.startsWith('push.fireLit');

/** Birthday pushes: a friend's rose blooming, or a card to sign. */
const isBirthdayPush = (job: Pick<PushJob, 'kind' | 'copy'>) =>
  job.kind === 'card_signed' || job.copy.key.startsWith('push.birthday');

/**
 * The kind of push as the notification settings name it, for resting a kind after unopened ones.
 * Null for pushes that never rest: who moved in, knocks, remember-me seeds and the "a few things"
 * pushes, which stand for several kinds at once.
 */
export function notificationTypeOf(
  job: Pick<PushJob, 'kind' | 'copy' | 'farm' | 'forYou'>,
): NotificationType | null {
  if (PASSIVE_COPY.has(job.copy.key)) return null;
  const category = categoryOf(job);
  if (category === 'reminder' || category === 'knock') return null;
  if (category === 'nudge') return 'nudges';
  if (isPlanPush(job)) return 'plans';
  if (isBirthdayPush(job)) return 'birthdays';
  if (category === 'doorstep') return 'doorstep';
  if (category === 'mention') return job.forYou ? 'mentions' : 'messages';
  return null;
}

/**
 * Whether the person's "Knock for" toggles on this farm let a push through: plans, the doorstep,
 * mentions (and replies), and every other message. Who moved in, knocks, nudges and remember-me
 * seeds aren't among the toggles.
 */
export function knockAllows(
  knockFor: FarmNotifications['knockFor'],
  job: Pick<PushJob, 'kind' | 'copy' | 'forYou'>,
  category: PushCategory,
): boolean {
  if (isPlanPush(job)) return knockFor.plans;
  if (category === 'doorstep') return knockFor.doorstep;
  if (category === 'mention') return job.forYou ? knockFor.mentions : knockFor.messages;
  return true;
}

/** A short stable tag for an id, so keys stay within the queue's 64 characters. FNV-1a, 52 bits. */
export function tag(id: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const char of new TextEncoder().encode(id)) {
    hash ^= BigInt(char);
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return (hash >> 12n).toString(36);
}

const compactDate = (date: string) => date.replaceAll('-', '');

/**
 * The key a push counts against: per person per day for the doorstep, per farm per hour for a
 * knock, per farm per day otherwise. `hour` is the local hour, 0–23.
 */
export function budgetKey(
  category: PushCategory,
  farm: string | null,
  date: string,
  hour = 0,
): string {
  const day = compactDate(date);
  if (category === 'doorstep') return `doorstep.${day}`;
  if (category === 'knock')
    return `knock.${tag(farm ?? '')}.${day}${String(hour).padStart(2, '0')}`;
  return `${category}.${tag(farm ?? '')}.${day}`;
}

/**
 * The collapse key of a day's pushes: the doorstep push, and one per farm for everything else, so
 * the "a few things" push replaces the one already on the lock screen. Mentions each have their
 * own until they collapse.
 */
export function collapseKeyFor(
  category: PushCategory,
  farm: string | null,
  date: string,
  seq: number | null,
): string {
  const day = compactDate(date);
  if (category === 'doorstep') return `doorstep.${day}`;
  if ((category === 'mention' || category === 'knock') && seq !== null) {
    return `${category}.${tag(farm ?? '')}.${seq}`;
  }
  if (category === 'nudge' || category === 'reminder') return `${category}.${day}`;
  return fewCollapseKey(farm, date);
}

/** Where an over-budget push for a farm collapses. */
export function fewCollapseKey(farm: string | null, date: string): string {
  return `farm.${tag(farm ?? '')}.${compactDate(date)}`;
}
