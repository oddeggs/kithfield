import {
  type CottageDelivery,
  FarmEvent,
  type FarmId,
  type FarmState,
  isTombstone,
  type PersonId,
} from '@kithfield/contracts';

import type { Bindings } from '../env';
import { ensureTimers, resetCalendarTimers } from './alarms';
import { localDate } from './calendar';
import { isForYou, previewOf, replyTarget } from './content';
import { endMembership, setRole, updateFarm, upsertMembership } from './d1';
import { Farm } from './farm';
import type { FarmPorts } from './ports';
import { attachmentOf, connected, envelope, joined, refuse, send, who } from './sockets';
import { FarmStore } from './store';
import { tombstoneEvent, tombstoneMediaOf } from './tombstones';

/** `farm_opened` is written at most once an hour per person. */
const OPENED_EVERY_MS = 60 * 60_000;
/** Shared rain: three or more members here within ten minutes, at most once a day. */
const SHARED_RAIN_WINDOW_MS = 10 * 60_000;
const SHARED_RAIN_PEOPLE = 3;

/** Who left with an event, so their sockets close. */
const departed = (event: FarmEvent): PersonId | null => {
  if (event.kind === 'left') return event.actor;
  if (event.kind === 'removed' && !isTombstone(event.payload)) return event.payload.person;
  return null;
};

/**
 * Everything around a commit: telling the sockets, keeping D1's memberships in step, handing each
 * member's cottage the news, deleting media, and keeping the alarm on the next timer.
 */
export class FarmHost {
  readonly farm: Farm;

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

  /**
   * Runs in a command's transaction: an unsend tombstones its target, and a removal with
   * `removeMedia` tombstones that person's media. Collects the media keys to delete.
   */
  effectsOf(media: string[]) {
    return (event: FarmEvent): void => {
      if (isTombstone(event.payload)) return;
      if (event.kind === 'unsend' && event.payload.by === 'author') {
        media.push(...tombstoneEvent(this.store, event.payload.target, 'unsent'));
      }
      if (event.kind === 'removed' && event.payload.removeMedia) {
        media.push(...tombstoneMediaOf(this.store, event.payload.person));
      }
    };
  }

  /** Broadcasts new events to every socket, then closes the sockets of anyone who left. */
  publish(events: readonly FarmEvent[]): void {
    const sockets = this.sockets();
    for (const event of events) {
      for (const ws of sockets) send(ws, { type: 'event', event: envelope(event) });
    }
    for (const event of events) {
      const gone = departed(event);
      if (gone === null) continue;
      for (const ws of sockets) if (attachmentOf(ws).person === gone) refuse(ws, 'not_member');
    }
  }

  /** The work after a commit that may wait on the network. */
  async settle(events: readonly FarmEvent[], media: readonly string[] = []): Promise<void> {
    const state = this.farm.state;
    if (state === null) return;
    for (const event of events) await this.syncMemberships(state, event);
    for (const event of events) {
      if (event.kind === 'settings_changed' && event.payload.setting === 'calendar') {
        resetCalendarTimers(this.store, state, this.now());
      } else if (event.kind === 'settings_changed' && event.payload.setting === 'place') {
        ensureTimers(this.store, state, this.now());
      }
    }
    await this.schedule();
    const deliveries = events
      .filter((e) => e.kind !== 'slow_post')
      .map((e) => this.deliver(state, e));
    if (media.length > 0) deliveries.push(this.env.MEDIA.delete([...media]).catch(() => undefined));
    this.ctx.waitUntil(Promise.allSettled(deliveries));
  }

  /** Points the object's one alarm at the next timer. */
  async schedule(): Promise<void> {
    const next = this.store.nextDue();
    if (next === null) await this.ctx.storage.deleteAlarm();
    else if ((await this.ctx.storage.getAlarm()) !== next) await this.ctx.storage.setAlarm(next);
  }

  private async syncMemberships(state: FarmState, event: FarmEvent): Promise<void> {
    const db = this.env.DB;
    const farm: FarmId = state.farm;
    if (isTombstone(event.payload)) return;
    if (event.kind === 'joined' && event.actor !== null) {
      const role = state.members.find((m) => m.person === event.actor)?.role ?? 'critter';
      await upsertMembership(db, farm, event.actor, role, event.at);
    } else if (event.kind === 'left' && event.actor !== null) {
      await endMembership(db, farm, event.actor, event.at);
    } else if (event.kind === 'removed') {
      await endMembership(db, farm, event.payload.person, event.at);
    } else if (event.kind === 'settings_changed') {
      const p = event.payload;
      if (p.setting === 'name') await updateFarm(db, farm, { name: p.name });
      if (p.setting === 'land') await updateFarm(db, farm, { land: p.land });
      if (p.setting === 'role') {
        await setRole(db, farm, p.person, p.role);
        if (p.role === 'keeper') await updateFarm(db, farm, { keeper: p.person });
      }
    }
  }

  /** Hands one event to every member's cottage. */
  async deliver(state: FarmState, event: FarmEvent): Promise<void> {
    const open = connected(this.sockets());
    const reply = replyTarget(event);
    const repliedTo = reply === undefined ? null : (this.store.event(reply)?.actor ?? null);
    const preview = previewOf(event);
    const { cottage } = this.ports();
    await Promise.allSettled(
      state.members.map(async ({ person }) => {
        const delivery: CottageDelivery = {
          farm: state.farm,
          seq: event.seq,
          kind: event.kind,
          actor: event.actor,
          at: event.at,
          preview,
          forYou: isForYou(event, person, repliedTo),
          connected: open.has(person),
        };
        try {
          await cottage.deliver(this.env, person, delivery);
        } catch (error) {
          console.warn('cottage delivery failed', {
            seq: event.seq,
            error: error instanceof Error ? error.message : 'unknown',
          });
        }
      }),
    );
  }

  /** A slow post has arrived: its cottages hear about it now. */
  async arrived(seq: number): Promise<void> {
    const state = this.farm.state;
    const parsed = FarmEvent.safeParse(this.store.event(seq));
    if (state === null || !parsed.success || isTombstone(parsed.data.payload)) return;
    await this.deliver(state, parsed.data);
  }

  /** Presence: writes `farm_opened` at most hourly, then shared rain when enough are here. */
  async opened(person: PersonId): Promise<void> {
    const state = this.farm.state;
    if (state === null || !state.members.some((m) => m.person === person)) return;
    const now = this.now();
    const last = this.store.lastAt('farm_opened', person);
    if (last !== null && now - last < OPENED_EVERY_MS) return;
    const events: FarmEvent[] = [];
    const opened = this.farm.write(person, 'farm_opened', {}, now);
    if (opened !== null) events.push(opened);
    const rain = this.sharedRain(now);
    if (rain !== null) events.push(rain);
    this.publish(events);
    await this.settle(events);
  }

  private sharedRain(now: number): FarmEvent | null {
    const state = this.farm.state;
    if (state === null) return null;
    const day = localDate(now, state.timeZone);
    const last = this.store.latest('shared_rain');
    if (last !== null && (last.payload as { day?: string }).day === day) return null;
    const members = new Set(state.members.map((m) => m.person));
    const here = new Set([
      ...this.store.actorsSince('farm_opened', now - SHARED_RAIN_WINDOW_MS),
      ...who(this.sockets(), 'here'),
    ]);
    const people = [...here].filter((p) => members.has(p)).sort();
    if (people.length < SHARED_RAIN_PEOPLE) return null;
    return this.farm.write(null, 'shared_rain', { day, people }, now);
  }
}
