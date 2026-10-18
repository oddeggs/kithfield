import { ExtensionStorage } from '@bacons/apple-targets';
import {
  APP_GROUP_PATHS,
  PushOpenedRequest,
  type FarmId,
  type FarmState,
  type Lang,
  type PersonId,
} from '@kithfield/contracts';
import { z } from 'zod';

import type { DataClient } from '../../data';
import type { ArtStore } from '../../ui/art/art-store';
import { surfaces } from '../../../modules/surfaces';
import { PERSON_FILE } from './clear';
import type { GroupStore } from './group-store';
import { imageJobs, type ExtraCritter } from './image-plan';
import type { SurfaceTarget } from './links';
import { readResponse, responseOpId } from './notification-actions';
import { planDayActivities, planDayChanges, type PlanDayInput } from './plan-day';
import { writeImages } from './render';
import { drainShares, type ShareSender } from './share-outbox';
import { surfaceData, type FarmRow, type FarmSource } from './surface-data';

/*
 * Keeps the native surfaces in step with the farms: writes `SurfaceData` and its images into the
 * App Group and reloads the widgets (after farm activity at most every 15 minutes, and at once when
 * the fire is lit or goes out), keeps the plan's day on the Lock Screen, sends what the share
 * extension left, and answers pushes acted on from the Lock Screen.
 */

/** Widgets are rewritten at most this often for ordinary farm activity. */
export const WIDGET_INTERVAL_MS = 15 * 60_000;
/** The farm list is read again at most this often. */
const LIST_MS = 5 * 60_000;
/** Cached events read per farm, for who's by the fire and the latest activity. */
const EVENTS = 60;

export interface SurfacesDeps {
  readonly client: DataClient;
  readonly art: ArtStore;
  readonly group: GroupStore;
  readonly me: PersonId;
  readonly lang: () => Lang;
  readonly scheme: string;
  readonly shares: ShareSender;
  readonly open: (target: SurfaceTarget) => void;
  readonly report: (error: unknown) => void;
  readonly now?: () => number;
}

const statesOf = (list: readonly FarmSource[]): PlanDayInput[] =>
  list.flatMap((s) => (s.state ? [{ farm: s.row.farm, state: s.state }] : []));

export function createSurfaces(deps: SurfacesDeps) {
  const now = deps.now ?? Date.now;
  let rows: { at: number; rows: readonly FarmRow[] } | null = null;
  let lastWrite = 0;
  let writing: Promise<void> | null = null;
  let again = false;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  async function farmRows(fresh: boolean): Promise<readonly FarmRow[]> {
    if (!fresh && rows !== null && now() - rows.at < LIST_MS) return rows.rows;
    const list = await deps.client.api.farms();
    rows = { at: now(), rows: list.farms };
    return list.farms;
  }

  async function sources(fresh: boolean, catchUp: readonly FarmId[]): Promise<FarmSource[]> {
    const list = await farmRows(fresh);
    return Promise.all(
      list.map(async (row) => {
        if (catchUp.includes(row.farm)) {
          await deps.client.catchUp(row.farm).catch(deps.report);
        }
        const replica = await deps.client.replica(row.farm);
        const events = await deps.client.events(row.farm, { limit: EVENTS });
        return { row, state: replica.getState().state, events };
      }),
    );
  }

  /** The person's own critter, from any farm that has them. */
  function mine(list: readonly FarmSource[]): ExtraCritter[] {
    for (const { state } of list) {
      const me = state?.members.find((m) => m.person === deps.me);
      if (me) return [{ person: me.person, critter: me.critter }];
    }
    return [];
  }

  async function write(catchUp: readonly FarmId[]): Promise<void> {
    const at = now();
    const list = await sources(catchUp.length > 0, catchUp);
    const data = surfaceData({
      farms: list,
      me: deps.me,
      lang: deps.lang(),
      scheme: deps.scheme,
      now: at,
    });
    await writeImages(deps.art, deps.group, imageJobs(data, at, mine(list)), () => stopped);
    if (stopped) return;
    // Who "you" is, for the extensions: they say "you" for this person wherever an id is theirs.
    await deps.group.write(PERSON_FILE, JSON.stringify({ person: deps.me }));
    await deps.group.write(APP_GROUP_PATHS.data, JSON.stringify(data));
    lastWrite = at;
    try {
      ExtensionStorage.reloadWidget();
    } catch (error) {
      deps.report(error);
    }
    await planDays(statesOf(list));
  }

  /** Starts, moves along and ends the plan-day activities. */
  async function planDays(farms: readonly PlanDayInput[]): Promise<void> {
    if (surfaces === null) return;
    const wanted = planDayActivities(farms, deps.me, now(), deps.scheme);
    const running = (await surfaces.listActivities()).filter((a) => a.kind === 'plan_day');
    const changes = planDayChanges(wanted, running);
    for (const w of changes.start) {
      // iOS refuses in the background; the server's push-to-start covers that case.
      await surfaces.startActivity(
        'plan_day',
        w.key,
        JSON.stringify(w.attributes),
        JSON.stringify(w.state),
        true,
      );
    }
    for (const u of changes.update) await surfaces.updateActivity(u.id, u.stateJson);
    for (const id of changes.end) await surfaces.endActivity(id, null);
  }

  /**
   * Rewrites the surfaces: at once when `force` (the fire, a refresh push, a share), otherwise
   * only when the last write is older than the widgets' interval. `catchUp` brings those farms up
   * to date over HTTP first. Writes never overlap; one asked for meanwhile runs after.
   */
  function refresh(options: { force?: boolean; catchUp?: readonly FarmId[] } = {}): Promise<void> {
    if (stopped) return Promise.resolve();
    const due = options.force === true || now() - lastWrite >= WIDGET_INTERVAL_MS;
    if (!due) {
      clearTimeout(timer);
      timer = setTimeout(() => void refresh(), WIDGET_INTERVAL_MS - (now() - lastWrite));
      // The plan's day follows every answer and arrival, not the widgets' interval.
      return sources(false, [])
        .then((list) => planDays(statesOf(list)))
        .catch(deps.report);
    }
    if (writing) {
      again = true;
      return writing;
    }
    writing = write(options.catchUp ?? [])
      .catch(deps.report)
      .finally(() => {
        writing = null;
        if (again && !stopped) {
          again = false;
          void refresh({ force: true });
        }
      });
    return writing;
  }

  /** Sends what the share extension left, then opens the farm it went to. */
  async function shares(): Promise<void> {
    const sentTo = await drainShares(deps.group, deps.shares, deps.report);
    const last = sentTo[sentTo.length - 1];
    if (last !== undefined) deps.open({ to: 'farm', farm: last });
  }

  /** A push someone acted on: send their answer, or open what it was about. */
  async function respond(response: {
    id: string;
    action: string;
    category: string | null;
    data: unknown;
    at: number;
  }): Promise<void> {
    const read = readResponse(response.action, response.category, response.data, () =>
      responseOpId(response.id, response.action, response.at),
    );
    if (read.kind === 'command') {
      const { opId, kind, payload } = read.command;
      // Queued, so it's drawn at once and retried; and sent straight away over HTTP under the
      // same op id, as the farm's socket sleeps while the app is in the background. The farm
      // applies an op id once, so the outbox's later send of it is only acknowledged.
      const sent = await deps.client.send(read.farm, kind, payload, opId);
      if (sent.status === 'refused') {
        deps.report(new Error(`${kind} refused: ${sent.reason}`));
        return;
      }
      await deps.client.api.command(read.farm, { opId, kind, payload }).catch(deps.report);
    } else if (read.kind === 'open') {
      deps.open(read.target);
      const body = PushOpenedRequest.parse({ id: read.push });
      await deps.client.api
        .request(z.unknown(), 'POST', '/v1/push/opened', body)
        .catch(deps.report);
    }
  }

  return {
    refresh,
    shares,
    respond,
    stop() {
      stopped = true;
      clearTimeout(timer);
    },
  };
}

export type Surfaces = ReturnType<typeof createSurfaces>;

/** Whether an event kind changes what the widgets show at once (the fire). */
export const urgentKind = (kind: string) => kind === 'fire' || kind === 'knock';

/** The fire's state of a farm, for noticing it lit or went out between writes. */
export const fireOf = (state: FarmState | null) => state?.fireLitAt ?? null;
