import {
  type FarmCommand,
  FarmEvent,
  type FarmState,
  isTombstone,
  type PersonId,
} from '@kithfield/contracts';

import type { Bindings } from '../env';
import { cottage } from './adapters/cottage';
import { ensureWeather, nextWake, resetWeather } from './alarms';
import { replyTarget } from './content';
import { endMembership, setRole, updateFarm, upsertMembership } from './d1';
import { Farm, type Written } from './farm';
import { departed, handOff } from './handoff';
import type { FarmPorts } from './ports';
import { attachmentOf, connected, envelope, joined, refuse, send } from './sockets';
import { FarmStore } from './store';
import { tombstoneEvent, tombstoneMediaOf } from './tombstones';

/** `farm_opened` is written at most once an hour per person. */
const OPENED_EVERY_MS = 60 * 60_000;

/**
 * Everything around a commit: telling the sockets, the follow-ups the farm writes itself (a new
 * keeper, `hibernate` for someone who joins hibernating), keeping D1's memberships in step,
 * handing each member's cottage the news, deleting media, and keeping the alarm on the next wake.
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

  /** A phone's command: a slow post is timed in its recipient's own time zone, from their cottage. */
  async command(cmd: FarmCommand, person: PersonId, media: string[]): Promise<Written> {
    const recipientZone =
      cmd.kind === 'slow_post'
        ? await cottage
            .settingsOf(this.env, cmd.payload.to)
            .then((s) => s.timeZone)
            .catch(() => undefined)
        : undefined;
    return this.farm.command(cmd, person, {
      then: this.effectsOf(media),
      ...(recipientZone === undefined ? {} : { recipientZone }),
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
      if (gone === null) continue;
      for (const ws of sockets) if (attachmentOf(ws).person === gone) refuse(ws, 'not_member');
    }
  }

  /** A farm always has a keeper: when the last one goes, the longest-standing member becomes it. */
  private handOverKeeper(state: FarmState): FarmEvent | null {
    if (state.kind !== 'farm' || state.members.some((m) => m.role === 'keeper')) return null;
    const next = [...state.members].sort((a, b) => a.joinedAt - b.joinedAt)[0];
    if (next === undefined) return null;
    const payload = { setting: 'role', person: next.person, role: 'keeper' };
    return this.farm.write(null, 'settings_changed', payload, this.now());
  }

  /** Someone who joins while hibernating gets `hibernate {on: true}` right after their `joined`. */
  private async stillHibernating(event: FarmEvent): Promise<FarmEvent | null> {
    if (event.kind !== 'joined' || event.actor === null) return null;
    const person = event.actor;
    const settings = await cottage.settingsOf(this.env, person).catch(() => null);
    if (settings?.hibernating !== true) return null;
    return this.farm.write(person, 'hibernate', { on: true }, this.now());
  }

  /** The work after a commit: follow-ups, D1, the weather, the alarm, the cottages and media. */
  async settle(events: readonly FarmEvent[], media: readonly string[] = []): Promise<void> {
    const extra: FarmEvent[] = [];
    // Written before anything awaits, so the keeper follows the departure directly.
    const left = events.some((e) => departed(e) !== null);
    const state0 = this.farm.state;
    const keeper = left && state0 !== null ? this.handOverKeeper(state0) : null;
    if (keeper !== null) extra.push(keeper);
    for (const event of events) {
      const hibernate = await this.stillHibernating(event);
      if (hibernate !== null) extra.push(hibernate);
    }
    this.publish(extra);
    const all = [...events, ...extra];
    const state = this.farm.state;
    if (state === null) return;
    for (const event of all) await this.syncMemberships(state, event);
    if (all.some((e) => e.kind === 'settings_changed' && !isTombstone(e.payload))) {
      resetWeather(this.store, state, this.now());
    }
    await this.schedule();
    const open = connected(this.sockets());
    for (const event of all.filter((e) => e.kind !== 'slow_post')) {
      await handOff(this.env, state, event, open, this.repliedTo(event));
    }
    if (media.length > 0) {
      this.ctx.waitUntil(this.env.MEDIA.delete([...media]).catch(() => undefined));
    }
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

  private async syncMemberships(state: FarmState, event: FarmEvent): Promise<void> {
    const db: D1Database = this.env.DB;
    const farm = state.farm;
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

  /** A slow post has arrived: its cottages hear about it now. */
  async arrived(seq: number): Promise<void> {
    const state = this.farm.state;
    const parsed = FarmEvent.safeParse(this.store.event(seq));
    if (state === null || !parsed.success || isTombstone(parsed.data.payload)) return;
    await handOff(this.env, state, parsed.data, connected(this.sockets()), null);
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
    const opened = this.farm.write(actor, 'farm_opened', {}, now);
    if (opened !== null) events.push(opened);
    const after = this.farm.state;
    const rain = after === null ? null : this.ports().rules.farmChores(after, now).sharedRain;
    const rained = rain === null ? null : this.farm.write(null, 'shared_rain', rain, now);
    if (rained !== null) events.push(rained);
    this.publish(events);
    await this.settle(events);
  }
}
