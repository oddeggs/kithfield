import { type FarmEvent, type FarmState, type RejectReason } from '@kithfield/contracts';
import { describe, expect, it } from 'vitest';

import { type CommandContext, checkCommand } from './commands';
import { DAY, MINUTE, T0, bea, fig, kit, newFarm, pip } from './farm.test-data';

const plan = {
  title: 'Picnic',
  days: [{ date: '2026-10-18' }],
  place: null,
  yeses: 'couple',
  someday: false,
};

/** A farm with a message from bea (seq 5), a plan (seq 6) and a firefly for pip (seq 7). */
const setup = () => {
  const log = newFarm();
  const message = log.add('message', bea, { text: 'hello' });
  const seed = log.add('seed_planted', bea, plan);
  const firefly = log.add('firefly', fig, { action: 'left', to: pip });
  const events = new Map<number, FarmEvent>(log.events.map((e) => [e.seq, e]));
  const context: CommandContext = { event: (seq) => events.get(seq) };
  return { log, state: log.state(), message, seed, firefly, context };
};

const check = (
  state: FarmState,
  kind: string,
  payload: unknown,
  actor = bea,
  now = T0,
  context: CommandContext = {},
): true | RejectReason => {
  const result = checkCommand(state, { kind, payload }, actor, now, context);
  return result.ok ? true : result.reason;
};

describe('checkCommand', () => {
  it('rejects payloads that fail the schema, and writers who are not members', () => {
    const { state } = setup();
    expect(check(state, 'message', { text: '' })).toBe('invalid');
    expect(check(state, 'joined', {})).toBe('invalid');
    expect(check(state, 'message', { text: 'hi' }, kit)).toBe('not_member');
    expect(check(state, 'message', { text: 'hi' })).toBe(true);
  });

  it('refuses writes to a frozen farm and from a paused person, but always lets them leave', () => {
    const { log } = setup();
    log.add('settings_changed', null, { setting: 'paused', person: pip, until: T0 + DAY });
    expect(check(log.state(), 'dewdrop', {}, pip)).toBe('account_paused');
    expect(check(log.state(), 'dewdrop', {}, pip, T0 + DAY + 1)).toBe(true);
    expect(check(log.state(), 'left', {}, pip)).toBe(true);
    log.add('settings_changed', null, { setting: 'frozen', on: true });
    expect(check(log.state(), 'dewdrop', {}, bea)).toBe('farm_frozen');
    expect(check(log.state(), 'left', {}, bea)).toBe(true);
  });

  it('allows edits by the author for 15 minutes, and only of messages', () => {
    const { state, message, seed, context } = setup();
    const edit = (actor: string, now: number, target = message.seq) =>
      check(state, 'edit', { target, text: 'fixed' }, actor, now, context);
    expect(edit(bea, T0 + 14 * MINUTE)).toBe(true);
    expect(edit(bea, T0 + 16 * MINUTE)).toBe('edit_window_closed');
    expect(edit(pip, T0)).toBe('not_allowed');
    expect(edit(bea, T0, seed.seq)).toBe('invalid');
    expect(edit(bea, T0, 99)).toBe('not_found');
  });

  it('lets authors unsend their own writes, slow posts only until delivered', () => {
    const { log, context, message } = setup();
    const post = log.add('slow_post', bea, {
      to: pip,
      text: 'later',
      when: 'morning',
      deliverAt: T0 + DAY,
    });
    const all = new Map(log.events.map((e) => [e.seq, e]));
    const ctx: CommandContext = { event: (seq) => all.get(seq) };
    const state = log.state();
    expect(check(state, 'unsend', { target: message.seq }, bea, T0, context)).toBe(true);
    expect(check(state, 'unsend', { target: message.seq }, pip, T0, context)).toBe('not_allowed');
    expect(check(state, 'unsend', { target: 2 }, bea, T0, ctx)).toBe('not_allowed');
    expect(check(state, 'unsend', { target: post.seq }, bea, T0 + DAY - 1, ctx)).toBe(true);
    expect(check(state, 'unsend', { target: post.seq }, bea, T0 + DAY, ctx)).toBe('not_allowed');
    const gone: CommandContext = {
      event: () => ({ ...message, payload: { tombstone: 'unsent' } }),
    };
    expect(check(state, 'reaction', { target: message.seq, reaction: 'sun' }, pip, T0, gone)).toBe(
      'gone',
    );
  });

  it('allows one knock per friend per day', () => {
    const { state } = setup();
    expect(check(state, 'knock', { to: pip })).toBe(true);
    expect(check(state, 'knock', { to: pip }, bea, T0, { knockedToday: [pip] })).toBe(
      'limit_reached',
    );
    expect(check(state, 'knock', { to: bea })).toBe('invalid');
    expect(check(state, 'knock', { to: kit })).toBe('unavailable');
  });

  it('opens only fireflies and gifts waiting for the writer', () => {
    const { state, firefly } = setup();
    expect(check(state, 'firefly', { action: 'opened', target: firefly.seq }, pip)).toBe(true);
    expect(check(state, 'firefly', { action: 'opened', target: firefly.seq }, bea)).toBe(
      'not_found',
    );
    expect(check(state, 'gift', { action: 'opened', gift: 'g_9' }, pip)).toBe('not_found');
  });

  it('signs birthday cards only on the day, when the farm has birthdays on', () => {
    const { log } = setup();
    const card = { to: pip, text: 'happy birthday' };
    expect(check(log.state(), 'card_signed', card)).toBe('invalid');
    log.add('critter_changed', pip, { birthday: '10-18' });
    expect(check(log.state(), 'card_signed', card)).toBe(true);
    expect(check(log.state(), 'card_signed', card, bea, T0 + DAY)).toBe('invalid');
    log.add('settings_changed', bea, { setting: 'birthdays', on: false });
    expect(check(log.state(), 'card_signed', card)).toBe('invalid');
  });

  it('checks plans: the seed exists, votes name a day, check-ins happen on the day, hats pass by their wearer', () => {
    const { state, seed } = setup();
    expect(check(state, 'rsvp', { seed: 99, answer: 'in' })).toBe('not_found');
    expect(check(state, 'vote', { seed: seed.seq, option: 0, on: true })).toBe(true);
    expect(check(state, 'vote', { seed: seed.seq, option: 1, on: true })).toBe('invalid');
    expect(check(state, 'checkin', { seed: seed.seq }, pip)).toBe(true);
    expect(check(state, 'checkin', { seed: seed.seq }, pip, T0 + DAY)).toBe('invalid');
    expect(check(state, 'seed_changed', { seed: seed.seq, hat: fig }, pip)).toBe('not_allowed');
    expect(check(state, 'seed_changed', { seed: seed.seq, hat: fig }, bea)).toBe(true);
    expect(check(state, 'seed_changed', { seed: seed.seq, place: { name: 'Park' } }, pip)).toBe(
      true,
    );
  });

  it('sits by the fire only while it is lit, once a session', () => {
    const { log } = setup();
    expect(check(log.state(), 'fire', { state: 'sat' })).toBe('invalid');
    log.add('fire', pip, { state: 'lit' });
    expect(check(log.state(), 'fire', { state: 'sat' })).toBe(true);
    expect(check(log.state(), 'fire', { state: 'sat' }, bea, T0, { satByFire: true })).toBe(
      'limit_reached',
    );
  });

  it('keeps settings and removals to keepers, and a keeper on every farm', () => {
    const { state } = setup();
    expect(check(state, 'settings_changed', { setting: 'name', name: 'Ours' }, pip)).toBe(
      'not_allowed',
    );
    expect(check(state, 'settings_changed', { setting: 'name', name: 'Ours' })).toBe(true);
    expect(
      check(state, 'settings_changed', { setting: 'role', person: bea, role: 'critter' }),
    ).toBe('invalid');
    expect(check(state, 'settings_changed', { setting: 'role', person: pip, role: 'keeper' })).toBe(
      true,
    );
    expect(check(state, 'removed', { person: pip, removeMedia: false }, fig)).toBe('not_allowed');
    expect(check(state, 'removed', { person: pip, removeMedia: false })).toBe(true);
    expect(check(state, 'removed', { person: bea, removeMedia: false })).toBe('invalid');
    expect(check(state, 'removed', { person: kit, removeMedia: false })).toBe('not_found');
  });

  it('lets both people on a visit change its look, but a visit has no name, roles or approval', () => {
    const visit = newFarm({ kind: 'visit' }).state();
    const [june] = visit.members.map((m) => m.person);
    expect(check(visit, 'settings_changed', { setting: 'theme', theme: 'dusk' }, june)).toBe(true);
    expect(check(visit, 'settings_changed', { setting: 'name', name: 'Us' }, june)).toBe('invalid');
    expect(check(visit, 'removed', { person: 'p_otis', removeMedia: false }, june)).toBe(
      'not_allowed',
    );
  });
});
