import type { ModerationAction, RuleRef } from '@kithfield/contracts';

import { ACCOUNT_BAN_SCOPE, banPerson } from '../auth';
import { cottageOf } from '../cottage/stub';
import type { Bindings } from '../env';
import { farmStub } from '../farm/http';
import type { ReportRow } from './store';
import { farmsOf } from './store';

/*
 * What a decision does outside the desk's own tables: the farm object's safety calls (the event
 * removed under a rule, a member removed, a person paused, a farm frozen) and auth's bans. The
 * safety team writes on farms with a null actor.
 */

/** A pause blocks posting on every farm for its length; the ban row records it for the desk. */
export const PAUSE_SCOPE = 'pause';
export const PAUSE_MS = 7 * 24 * 60 * 60_000;

/** The decisions that take the reported event down along with whatever else they do. */
const REMOVES_EVENT: ReadonlySet<ModerationAction> = new Set([
  'remove',
  'remove_warn',
  'pause_7d',
  'remove_from_farm',
  'remove_from_kithfield',
]);

export interface Effects {
  readonly removedEvent: boolean;
  readonly pausedUntil: number | null;
}

export type EffectsOutcome = { ok: true; effects: Effects } | { ok: false; code: 'conflict' };

/** Closes a banned person's sockets: their cottage's and every farm's they live on. */
export async function closeEverywhere(
  env: Bindings,
  person: string,
  farms: readonly string[],
): Promise<void> {
  await cottageOf(env, person).closeSockets('banned');
  await Promise.all(farms.map((farm) => farmStub(env, farm).closeSockets(person, 'banned')));
}

/** Ends a ban of `scope` now (a ban written to have already run out). */
const liftBan = (env: Bindings, person: string, scope: string, reason: string, now: number) =>
  banPerson(env.DB, { person, scope, until: now, reason });

export async function applyEffects(
  env: Bindings,
  report: ReportRow,
  action: { id: string; action: ModerationAction; rule: RuleRef | null },
  now: number,
): Promise<EffectsOutcome> {
  const farm = farmStub(env, report.farm);
  const person = report.reported;
  let removedEvent = false;

  if (REMOVES_EVENT.has(action.action)) {
    // Removing the message alone needs a message; the account decisions work for a person too.
    const onlyRemoves = action.action === 'remove' || action.action === 'remove_warn';
    if (report.seq === null) {
      if (onlyRemoves) return { ok: false, code: 'conflict' };
    } else if (action.rule !== null) {
      const out = await farm.removeEvent(report.seq, action.rule);
      removedEvent = out.ok;
      // `gone` (the author already unsent it) is fine; `not_found` means nothing to take down.
      if (!out.ok && out.reason === 'not_found' && onlyRemoves) {
        return { ok: false, code: 'conflict' };
      }
    }
  }

  let pausedUntil: number | null = null;
  switch (action.action) {
    case 'pause_7d': {
      pausedUntil = now + PAUSE_MS;
      await banPerson(env.DB, {
        person,
        scope: PAUSE_SCOPE,
        until: pausedUntil,
        reason: action.id,
      });
      const farms = await farmsOf(env.DB, person);
      await Promise.all(farms.map((f) => farmStub(env, f.farm).pause(person, pausedUntil)));
      break;
    }
    case 'remove_from_farm':
      await farm.removeMember(person, false);
      break;
    case 'remove_from_kithfield': {
      const farms = (await farmsOf(env.DB, person)).map((f) => f.farm);
      await banPerson(env.DB, { person, scope: ACCOUNT_BAN_SCOPE, until: null, reason: action.id });
      await closeEverywhere(env, person, farms);
      await Promise.all(farms.map((f) => farmStub(env, f).removeMember(person, false)));
      break;
    }
    case 'freeze_farm':
      await farm.freeze(true);
      break;
    case 'unfreeze_farm':
      await farm.freeze(false);
      break;
    case 'dismiss':
    case 'remove':
    case 'remove_warn':
    case 'escalate_urgent':
    case 'escalate_legal':
      break;
  }
  return { ok: true, effects: { removedEvent, pausedUntil } };
}

/**
 * Decisions an appeal can't undo from the desk yet: nothing lets a removed member back in.
 */
export const NOT_UNDOABLE: ReadonlySet<ModerationAction> = new Set([
  'remove_from_farm',
  'remove_from_kithfield',
]);

/**
 * An appeal undid a decision: the event comes back first, then a pause ends. False when the
 * event can't come back (its original is no longer held, after 180 days); then nothing changes.
 */
export async function undoEffects(
  env: Bindings,
  report: ReportRow,
  action: { id: string; action: ModerationAction; removedEvent: boolean },
  now: number,
): Promise<boolean> {
  const person = report.reported;
  if (action.removedEvent && report.seq !== null) {
    let restored: boolean;
    try {
      restored = (await farmStub(env, report.farm).restoreEvent(report.seq)).ok;
    } catch {
      restored = false;
    }
    if (!restored) return false;
  }
  if (action.action === 'pause_7d') {
    await liftBan(env, person, PAUSE_SCOPE, action.id, now);
    const farms = await farmsOf(env.DB, person);
    await Promise.all(farms.map((f) => farmStub(env, f.farm).pause(person, null)));
  }
  return true;
}
