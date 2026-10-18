import {
  actionCommand,
  NOTIFICATION_ACTIONS,
  NotificationAction,
  NotificationCategory,
  PlanPushData,
  PushData,
  type FarmCommand,
  type FarmId,
  type OpId,
} from '@kithfield/contracts';

import type { SurfaceTarget } from './links';

/*
 * A long-press on a push answers it without opening the app (`10 On the System`, notification
 * replies): "I'm in", "Can't this time", "Leave a dewdrop". The push arrives under a category
 * (`plan` or `tend`) whose actions iOS shows; a tap on one comes back here with the push's data,
 * and the write `actionCommand` builds goes through the outbox, so it is sent once even if iOS
 * hands it over twice. A plain tap opens what the push is about.
 */

/** iOS's identifier for a tap on the push itself, as expo-notifications reports it. */
export const DEFAULT_ACTION = 'expo.modules.notifications.actions.DEFAULT';

/** The catalogue key of each action's title. */
export const ACTION_TITLES = {
  im_in: 'surfaces.native.action.imIn',
  cant: 'surfaces.native.action.cant',
  dewdrop: 'surfaces.native.action.dewdrop',
} as const satisfies Record<NotificationAction, string>;

/** The categories as expo-notifications sets them: none of them opens the app. */
export function categories(title: (action: NotificationAction) => string) {
  return NotificationCategory.options.map((category) => ({
    identifier: category,
    actions: NOTIFICATION_ACTIONS[category].map((action) => ({
      identifier: action,
      buttonTitle: title(action),
      options: { opensAppToForeground: false },
    })),
  }));
}

/** What to do with a push someone acted on. */
export type Response =
  | { readonly kind: 'command'; readonly farm: FarmId; readonly command: FarmCommand }
  | { readonly kind: 'open'; readonly target: SurfaceTarget; readonly push: string }
  | { readonly kind: 'none' };

const fnv = (text: string, seed: bigint) => {
  let hash = seed;
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= BigInt(byte);
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return hash;
};

/**
 * The op id of an answer to one push: a UUIDv7 made from the push and the action, not at random,
 * so the same tap handed over twice (by the listener and the background task, or after a
 * relaunch) is one write.
 */
export function responseOpId(pushId: string, action: string, at: number): OpId {
  const ms = Math.max(0, Math.floor(at)).toString(16).padStart(12, '0').slice(-12);
  const a = fnv(`${pushId}\n${action}`, 0xcbf29ce484222325n).toString(16).padStart(16, '0');
  const b = fnv(`${action}\n${pushId}`, 0x84222325cbf29ce4n).toString(16).padStart(16, '0');
  const variant = ((parseInt(b.slice(0, 1), 16) & 0x3) | 0x8).toString(16);
  return `${ms.slice(0, 8)}-${ms.slice(8, 12)}-7${a.slice(0, 3)}-${variant}${b.slice(1, 4)}-${a.slice(3, 15)}`;
}

/** The push's `data`, as Expo delivers it: at the top level, or a JSON string under `body`. */
function pushData(raw: unknown) {
  const data =
    typeof raw === 'object' && raw !== null && 'body' in raw && typeof raw.body === 'string'
      ? (JSON.parse(raw.body) as unknown)
      : raw;
  const plan = PlanPushData.safeParse(data);
  if (plan.success) return plan.data;
  const push = PushData.safeParse(data);
  return push.success ? push.data : null;
}

/** Reads a response: the action, the push's category and its data. */
export function readResponse(
  actionIdentifier: string,
  categoryIdentifier: string | null | undefined,
  data: unknown,
  opId: () => OpId,
): Response {
  const push = pushData(data);
  if (push === null) return { kind: 'none' };
  if (actionIdentifier === DEFAULT_ACTION) {
    if (push.farm === null) return { kind: 'none' };
    const target: SurfaceTarget =
      'seed' in push && typeof push.seed === 'number'
        ? { to: 'plan', farm: push.farm, seed: push.seed }
        : { to: 'farm', farm: push.farm };
    return { kind: 'open', target, push: push.push };
  }
  const action = NotificationAction.safeParse(actionIdentifier);
  const category = NotificationCategory.safeParse(categoryIdentifier);
  if (!action.success || !category.success) return { kind: 'none' };
  const write = actionCommand(action.data, category.data, push, opId());
  return write === null ? { kind: 'none' } : { kind: 'command', ...write };
}
