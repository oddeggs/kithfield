import {
  type EpochMs,
  type EventEnvelope,
  type FarmCommand,
  type FarmEvent,
  type FarmState,
  type PersonId,
  type RejectReason,
  type Seq,
  FARM_WRITTEN_KINDS,
  FarmCommand as FarmCommandSchema,
  isTombstone,
} from '@kithfield/contracts';

import { memberOf } from './members';
import { isHangoutDay, seedOf } from './plans';
import { EDIT_WINDOW_MS } from './rules';
import { farmDay } from './seasons';
import { isBirthday, isKnownTimeZone } from './time';

/*
 * The farm's write-time validation. The farm object runs it before it appends a command, and a
 * phone runs it before applying its own write optimistically.
 */

export type CommandCheck =
  { readonly ok: true } | { readonly ok: false; readonly reason: RejectReason };

/** What the snapshot doesn't hold but the log does. Checks that need a missing piece are skipped. */
export interface CommandContext {
  /** An event in the farm's log by seq, or undefined if there is none. */
  readonly event?: (seq: Seq) => FarmEvent | EventEnvelope | undefined;
  /** Friends the actor has already knocked for today, farm time. */
  readonly knockedToday?: readonly PersonId[];
  /** Whether the actor has already sat by the fire since it was lit. */
  readonly satByFire?: boolean;
}

/** Any well-formed op id: the check reads the kind and payload only. */
const ANY_OP = '00000000-0000-7000-8000-000000000000';

/** What can't be unsent: the farm's records, settings, departures, unsends, statuses and critters. */
const NOT_UNSENDABLE = new Set<string>([
  ...FARM_WRITTEN_KINDS,
  'settings_changed',
  'unsend',
  'left',
  'removed',
  // A status is cleared with `words {text: null}`, a critter renamed by a new change.
  'status',
  'critter_changed',
]);

const ok: CommandCheck = { ok: true };
const no = (reason: RejectReason): CommandCheck => ({ ok: false, reason });

export const checkCommand = (
  state: FarmState,
  cmd: { readonly kind: string; readonly payload: unknown },
  actor: PersonId,
  now: EpochMs,
  context: CommandContext = {},
): CommandCheck => {
  const parsed = FarmCommandSchema.safeParse({
    opId: ANY_OP,
    kind: cmd.kind,
    payload: cmd.payload,
  });
  if (!parsed.success) return no('invalid');
  const me = memberOf(state, actor);
  if (!me) return no('not_member');
  // Leaving is always possible, even from a frozen farm or while paused.
  if (parsed.data.kind === 'left') return ok;
  if (state.frozen) return no('farm_frozen');
  if (me.pausedUntil !== null && me.pausedUntil > now) return no('account_paused');
  const reason = ruleFor(state, parsed.data, actor, now, context);
  return reason ? no(reason) : ok;
};

type Reason = RejectReason | null;

const target = (context: CommandContext, seq: Seq | undefined): Reason => {
  if (seq === undefined || !context.event) return null;
  const event = context.event(seq);
  if (!event) return 'not_found';
  return isTombstone(event.payload) ? 'gone' : null;
};

const friend = (state: FarmState, actor: PersonId, to: PersonId | undefined): Reason => {
  if (to === undefined) return null;
  if (to === actor) return 'invalid';
  return memberOf(state, to) ? null : 'unavailable';
};

const isKeeper = (state: FarmState, person: PersonId) => memberOf(state, person)?.role === 'keeper';

const authored = (
  context: CommandContext,
  seq: Seq,
  actor: PersonId,
  now: EpochMs,
  edit: boolean,
) => {
  const event = context.event?.(seq);
  if (!event) return null;
  if (event.actor !== actor) return 'not_allowed';
  if (NOT_UNSENDABLE.has(event.kind)) return 'not_allowed';
  if (edit && event.kind !== 'message') return 'invalid';
  if (edit && now - event.at > EDIT_WINDOW_MS) return 'edit_window_closed';
  const payload = event.payload as { deliverAt?: unknown };
  // A slow post can be recalled until it is delivered.
  if (
    event.kind === 'slow_post' &&
    typeof payload.deliverAt === 'number' &&
    payload.deliverAt <= now
  ) {
    return 'not_allowed';
  }
  return null;
};

const planned = (state: FarmState, seq: Seq): Reason => {
  const seed = seedOf(state, seq);
  if (!seed) return 'not_found';
  return seed.unsent ? 'gone' : null;
};

const ruleFor = (
  state: FarmState,
  cmd: FarmCommand,
  actor: PersonId,
  now: EpochMs,
  context: CommandContext,
): Reason => {
  const today = farmDay(state, now);
  switch (cmd.kind) {
    // A reply to a message unsent meanwhile still goes: it shows the original as unsent.
    case 'message':
    case 'sticker':
    case 'media':
    case 'voice':
    case 'link':
    case 'quiet_note':
    case 'status':
    case 'critter_changed':
    case 'left':
      return null;
    case 'edit':
    case 'unsend':
      return (
        target(context, cmd.payload.target) ??
        authored(context, cmd.payload.target, actor, now, cmd.kind === 'edit')
      );
    case 'reaction':
    case 'pin':
      return target(context, cmd.payload.target);
    case 'dewdrop':
      return target(context, cmd.payload.target) ?? friend(state, actor, cmd.payload.to);
    case 'wave':
    case 'hug':
    case 'slow_post':
      return friend(state, actor, cmd.payload.to);
    case 'knock':
      if (context.knockedToday?.includes(cmd.payload.to)) return 'limit_reached';
      return friend(state, actor, cmd.payload.to);
    case 'firefly': {
      const p = cmd.payload;
      if (p.action === 'left') return friend(state, actor, p.to);
      const waiting = state.doorstep.some(
        (d) => d.seq === p.target && d.kind === 'firefly' && d.to === actor,
      );
      return waiting ? null : 'not_found';
    }
    case 'gift': {
      const p = cmd.payload;
      if (p.action === 'given') return friend(state, actor, p.to);
      const waiting = state.doorstep.some((d) => d.gift === p.gift && d.to === actor);
      return waiting ? null : 'not_found';
    }
    case 'card_signed': {
      const birthday = memberOf(state, cmd.payload.to)?.birthday;
      const onTheDay = state.birthdaysBloom && !!birthday && isBirthday(birthday, today);
      return friend(state, actor, cmd.payload.to) ?? (onTheDay ? null : 'invalid');
    }
    case 'seed_planted':
      return target(context, cmd.payload.fromSeq);
    case 'seed_changed': {
      const p = cmd.payload;
      const seed = seedOf(state, p.seed);
      const missing = planned(state, p.seed);
      if (missing || !seed) return missing;
      // A sprouted plan keeps its day.
      if (seed.sproutedAt !== null && (p.days !== undefined || p.settleOn !== undefined)) {
        return 'invalid';
      }
      if (p.hat === undefined) return null;
      if (!memberOf(state, p.hat)) return 'invalid';
      // The hat is passed on by whoever wears it, the planter, or a keeper.
      return [seed.hat, seed.planter].includes(actor) || isKeeper(state, actor)
        ? null
        : 'not_allowed';
    }
    case 'vote': {
      const missing = planned(state, cmd.payload.seed);
      const seed = seedOf(state, cmd.payload.seed);
      if (missing || !seed) return missing;
      // A sprouted plan's day is settled.
      if (seed.sproutedAt !== null) return 'invalid';
      return cmd.payload.option < seed.days.length ? null : 'invalid';
    }
    case 'rsvp':
      return planned(state, cmd.payload.seed);
    case 'checkin': {
      const missing = planned(state, cmd.payload.seed);
      const seed = seedOf(state, cmd.payload.seed);
      if (missing || !seed) return missing;
      return isHangoutDay(seed, today) ? null : 'invalid';
    }
    case 'scrapbook_page': {
      const p = cmd.payload;
      if (p.action === 'hidden') return target(context, p.target);
      return p.seed === undefined ? null : planned(state, p.seed);
    }
    case 'fire':
      if (cmd.payload.state === 'lit') return null;
      if (state.fireLitAt === null) return 'invalid';
      return context.satByFire ? 'limit_reached' : null;
    case 'removed': {
      const { person } = cmd.payload;
      if (state.kind === 'visit' || !isKeeper(state, actor)) return 'not_allowed';
      if (person === actor) return 'invalid';
      if (!memberOf(state, person)) return 'not_found';
      return isKeeper(state, person) ? 'not_allowed' : null;
    }
    case 'settings_changed': {
      const p = cmd.payload;
      if (p.setting === 'calendar' && !isKnownTimeZone(p.timeZone)) return 'invalid';
      if (state.kind === 'visit') {
        return p.setting === 'name' || p.setting === 'role' || p.setting === 'approval'
          ? 'invalid'
          : null;
      }
      if (!isKeeper(state, actor)) return 'not_allowed';
      if (p.setting !== 'role') return null;
      if (!memberOf(state, p.person)) return 'not_found';
      const keepers = state.members.filter((m) => m.role === 'keeper' && m.person !== p.person);
      // A farm always keeps a keeper.
      return p.role !== 'keeper' && keepers.length === 0 ? 'invalid' : null;
    }
  }
};
