import {
  type FarmCommand,
  FarmEvent,
  type FarmState,
  isTombstone,
  type PersonId,
  type SocketErrorCode,
} from '@kithfield/contracts';

import type { Bindings } from '../env';
import { cottage } from './adapters/cottage';
import { ensureWeather, HELLO_DEADLINE_MS, nextWake, resetWeather, RETRY_MS } from './alarms';
import { refusalOf } from './command-guards';
import { replyTarget } from './content';
import { Farm, type Written } from './farm';
import { departed, handOff } from './handoff';
import { mirrorMembership } from './mirror';
import type { FarmPorts } from './ports';
import { attachmentOf, connected, envelope, joined, refuse, send } from './sockets';
import { FarmStore } from './store';
import { tombstoneEvent, tombstoneMediaOf } from './tombstones';

/** `farm_opened` is written at most once an hour per person. */
const OPENED_EVERY_MS = 60 * 60_000;

/** Runs one step after a commit; a failure is logged and never stops the steps after it. */
const step = async (what: string, work: () => Promise<unknown>): Promise<boolean> => {
  try {
    await work();
    return true;
  } catch (error) {
    console.error(`farm ${what} failed`, {
      error: error instanceof Error ? error.message : 'unknown',
    });
    return false;
  }
};

/**
 * Everything around a commit: telling the sockets, the follow-ups the farm writes itself (a new
 * keeper, `hibernate` for someone who joins hibernating), keeping D1's mirror of the memberships
 * in step, the alarm, media deletes, and handing each member's cottage the news.
 */
export class FarmHost {
  readonly farm: Farm;
  private flushing: Promise<void> | null = null;
  private flushAgain = false;

  constructor(
    readonly ctx: DurableObjectState,
    readonly env: Bindings,
    readonly ports: () => FarmPorts,
  ) {
    const store = new FarmStore(ctx.storage.sql);
    this.farm = new Farm(store, ports, (fn) => ctx.storage.transactionSync(fn));
  }

  get store(): FarmStore {
    return this.farm.store;
  }

  now(): number {
    return this.ports().clock.now();
  }

  sockets(closing?: WebSocket): WebSocket[] {
    return joined(this.ctx.getWebSockets(), closing);
  }

  /** Closes a person's sockets (or everyone's) with `error {code}`. */
  closeSockets(person: PersonId | null, code: SocketErrorCode): void {
    const ids = person === null ? null : new Set(this.store.idsOf(this.farm.actorOf(person)));
    for (const ws of this.ctx.getWebSockets()) {
      const who = attachmentOf(ws).person;
      if (ids === null || (who !== null && ids.has(who))) refuse(ws, code);
    }
  }

  /** On wake: move to newer rules if this server has them, and tell everyone. */
  async wake(): Promise<void> {
    if (this.farm.state !== null) this.store.prune(this.now());
    const changed = this.farm.upgradeRules();
    if (changed === null) {
      // The alarm follows whatever is due now, even when nothing changed on waking.
      await this.schedule();
      return;
    }
    this.publish([changed]);
    await this.settle([changed]);
  }

  /**
   * Runs in a command's transaction: an unsend tombstones its target, and a removal with
   * `removeMedia` tombstones that person's media. Collects the media keys to delete.
   */
  effectsOf(media: string[]) {
    return (event: FarmEvent): void => {
      if (isTombstone(event.payload)) return;
      if (event.kind === 'unsend' && event.payload.by === 'author') {
        media.push(...tombstoneEvent(this.store, event.payload.target, 'unsent', event.at));
      }
      if (event.kind === 'removed' && event.payload.removeMedia) {
        media.push(...tombstoneMediaOf(this.store, event.payload.person));
      }
    };
  }

  /**
   * A phone's command. For a write not answered yet: the checks outside the log (blocks, other
   * farms' media), and a slow post's recipient's own time zone, asked of their cottage.
   */
  async command(cmd: FarmCommand, person: PersonId, media: string[]): Promise<Written> {
    const answered = this.store.outcome(cmd.opId) !== null;
    const farm = this.farm.state?.farm;
    const actor = this.farm.actorOf(person);
    const refuse =
      answered || farm === undefined
        ? null
        : await refusalOf(this.env, farm, cmd, actor, (id) => this.farm.actorOf(id));
    const recipientZone =
      !answered && cmd.kind === 'slow_post'
        ? await cottage
            .settingsOf(this.env, cmd.payload.to)
            .then((s) => s.timeZone ?? undefined)
            .catch(() => undefined)
        : undefined;
    return this.farm.command(cmd, person, {
      then: this.effectsOf(media),
      ...(recipientZone === undefined ? {} : { recipientZone }),
      ...(refuse === null ? {} : { refuse }),
    });
  }

  /** Broadcasts new events to every socket, then closes the sockets of anyone who left. */
  publish(events: readonly FarmEvent[]): void {
    const sockets = this.sockets();
    for (const event of events) {
      for (const ws of sockets) send(ws, { type: 'event', event: envelope(event) });
    }
    for (const event of events) {
      const gone = departed(event);
      if (gone !== null) this.closeSockets(gone, 'not_member');
    }
  }

  /** Writes and publishes at once: a follow-up is seen right after what caused it. */
  private follow(
    actor: PersonId | null,
    kind: FarmEvent['kind'],
    payload: unknown,
  ): FarmEvent | null {
    const event = this.farm.write(actor, kind, payload, this.now());
    if (event !== null) this.publish([event]);
    return event;
  }

  /** A farm always has a keeper: when the last one goes, the longest-standing member becomes it. */
  private handOverKeeper(state: FarmState): FarmEvent | null {
    if (state.kind !== 'farm' || state.members.some((m) => m.role === 'keeper')) return null;
    const next = [...state.members].sort((a, b) => a.joinedAt - b.joinedAt)[0];
    if (next === undefined) return null;
    return this.follow(null, 'settings_changed', {
      setting: 'role',
      person: next.person,
      role: 'keeper',
    });
  }

  /** Someone who joins while hibernating gets `hibernate {on: true}` right after their `joined`. */
  private async stillHibernating(event: FarmEvent): Promise<FarmEvent | null> {
    if (event.kind !== 'joined' || event.actor === null) return null;
    const person = event.actor;
    const settings = await cottage.settingsOf(this.env, person).catch(() => null);
    if (settings?.hibernating !== true) return null;
    return this.follow(person, 'hibernate', { on: true });
  }

  /**
   * The work after a commit. Follow-ups and D1's membership mirror are done before returning, so a
   * hello right after a join works; each step runs even if another failed. The cottages hear after
   * the caller has its answer, and the alarm retries what they missed.
   */
  async settle(events: readonly FarmEvent[], media: readonly string[] = []): Promise<void> {
    const extra: FarmEvent[] = [];
    const state0 = this.farm.state;
    // Written before anything awaits, so the keeper follows the departure directly.
    if (state0 !== null && events.some((e) => departed(e) !== null)) {
      const keeper = this.handOverKeeper(state0);
      if (keeper !== null) extra.push(keeper);
    }
    for (const event of events) {
      const hibernate = await this.stillHibernating(event).catch(() => null);
      if (hibernate !== null) extra.push(hibernate);
    }
    const all = [...events, ...extra];
    for (const event of all) {
      const ok = await step('membership mirror', () => this.mirror(event));
      if (!ok) this.store.setTimer(`d1sync:${event.seq}`, this.now() + RETRY_MS);
    }
    if (all.some((e) => e.kind === 'settings_changed' && !isTombstone(e.payload))) {
      await step('weather', () => {
        const state = this.farm.state;
        if (state !== null) resetWeather(this.store, state, this.now());
        return Promise.resolve();
      });
    }
    if (media.length > 0) {
      await step('media delete', () => this.env.MEDIA.delete([...media]));
    }
    await step('schedule', () => this.schedule());
    this.ctx.waitUntil(this.flush());
  }

  /** Sends the cottages everything still owed; one run at a time, again if more was owed meanwhile. */
  flush(): Promise<void> {
    if (this.flushing !== null) {
      this.flushAgain = true;
      return this.flushing;
    }
    this.flushing = (async () => {
      do {
        this.flushAgain = false;
        await step('cottage handoff', () => this.flushOnce());
      } while (this.flushAgain);
      this.flushing = null;
    })();
    return this.flushing;
  }

  private async flushOnce(): Promise<void> {
    const state = this.farm.state;
    const owed = this.store.dueDeliveries(this.now());
    if (state === null || owed.length === 0) return;
    const events = owed.flatMap((seq) => {
      const parsed = FarmEvent.safeParse(this.store.event(seq));
      return parsed.success ? [parsed.data] : [];
    });
    const open = connected(this.sockets());
    const failed = await handOff(this.env, state, events, open, (e) => this.repliedTo(e));
    for (const seq of owed) {
      if (!failed.has(seq)) this.store.delivered(seq);
      else if (this.store.deliveryFailed(seq, this.now())) {
        console.error('farm gave up telling the cottages', { seq });
      }
    }
    // The alarm moves to the next retry once something failed, or leaves it once nothing is owed.
    await this.schedule();
  }

  private repliedTo(event: FarmEvent): PersonId | null {
    const reply = replyTarget(event);
    return reply === undefined ? null : (this.store.event(reply)?.actor ?? null);
  }

  /** Points the object's one alarm at the next wake. */
  async schedule(): Promise<void> {
    const state = this.farm.state;
    if (state !== null) ensureWeather(this.store, state, this.now());
    const next = nextWake(this.farm, this.ports());
    if (next === null) await this.ctx.storage.deleteAlarm();
    else if ((await this.ctx.storage.getAlarm()) !== next) await this.ctx.storage.setAlarm(next);
  }

  /** Keeps D1's mirror of one event's membership change; throws if D1 fails. */
  async mirror(event: FarmEvent): Promise<void> {
    const state = this.farm.state;
    if (state !== null) await mirrorMembership(this.env.DB, state, event);
  }

  /** A slow post has arrived: its cottages are owed its news now, and search finds it now. */
  arrived(seq: number): void {
    const post = this.store.event(seq);
    if (post === null || isTombstone(post.payload)) return;
    const text = (post.payload as { text?: unknown }).text;
    this.ctx.storage.transactionSync(() => {
      this.store.oweDelivery(seq, this.now());
      if (typeof text === 'string') this.store.index(seq, text);
    });
  }

  /** A socket must say hello soon after it opens; the alarm checks. */
  expectHello(): void {
    this.store.addTimer('hello', this.now() + HELLO_DEADLINE_MS);
  }

  /** Closes sockets opened before `openedBefore` that never said hello. */
  closeUnnamed(openedBefore: number): void {
    let waiting = false;
    for (const ws of this.ctx.getWebSockets()) {
      const a = attachmentOf(ws);
      if (a.person !== null) continue;
      if (a.openedAt <= openedBefore) refuse(ws, 'unauthorized');
      else waiting = true;
    }
    if (waiting) this.store.addTimer('hello', this.now() + HELLO_DEADLINE_MS);
  }

  /** Presence: writes `farm_opened` at most hourly, then shared rain when the rules say so. */
  async opened(person: PersonId): Promise<void> {
    const state = this.farm.state;
    const actor = this.farm.actorOf(person);
    if (state === null || !state.members.some((m) => m.person === actor)) return;
    const now = this.now();
    const last = this.store.lastAt('farm_opened', actor);
    if (last !== null && now - last < OPENED_EVERY_MS) return;
    const events: FarmEvent[] = [];
    const opened = this.follow(actor, 'farm_opened', {});
    if (opened !== null) events.push(opened);
    const after = this.farm.state;
    const rain = after === null ? null : this.ports().rules.farmChores(after, now).sharedRain;
    const rained = rain === null ? null : this.follow(null, 'shared_rain', rain);
    if (rained !== null) events.push(rained);
    await this.settle(events);
  }
}
