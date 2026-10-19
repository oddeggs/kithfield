import { SurfaceRefreshData } from '@kithfield/contracts';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';

/*
 * Pushes that reach the app without it being opened: a silent `SurfaceRefreshData` (the fire lit
 * or out, a knock) asking it to rewrite what the widgets draw, and a lock-screen action answered
 * while the app wasn't running. iOS wakes the app for them in the background; this task hands each
 * to the surfaces host once the data layer is up, and waits for it so iOS doesn't freeze the app
 * halfway.
 */

export const SURFACES_TASK = 'kithfield-surfaces';

/** iOS gives a woken app about 30 seconds; stop waiting a little before. */
const WAIT_MS = 25_000;

export type Woken =
  | { readonly kind: 'refresh'; readonly data: SurfaceRefreshData }
  | {
      readonly kind: 'response';
      readonly id: string;
      readonly action: string;
      readonly category: string | null;
      readonly data: unknown;
      readonly at: number;
    };

type Handler = (event: Woken) => Promise<void>;

const waiting: { event: Woken; done: () => void }[] = [];
let handler: Handler | null = null;

function drain() {
  if (handler === null) return;
  const run = handler;
  for (const item of waiting.splice(0)) {
    void run(item.event)
      .catch(() => undefined)
      .finally(item.done);
  }
}

/** Hands an event to the host, waiting for it (or a while) before answering. */
export function deliver(event: Woken): Promise<void> {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, WAIT_MS);
    waiting.push({
      event,
      done: () => {
        clearTimeout(timer);
        resolve();
      },
    });
    drain();
  });
}

/** The host takes the events, now and as they come; answers how to stop. */
export function takeWoken(next: Handler): () => void {
  handler = next;
  drain();
  return () => {
    if (handler === next) handler = null;
  };
}

/** Reads the task's payload: a silent push's data, or a response to an action. */
export function readWoken(payload: unknown): Woken | null {
  if (typeof payload !== 'object' || payload === null) return null;
  if ('actionIdentifier' in payload && 'notification' in payload) {
    const response = payload as Notifications.NotificationResponse;
    const request = response.notification.request;
    return {
      kind: 'response',
      id: request.identifier,
      action: response.actionIdentifier,
      category: request.content.categoryIdentifier ?? null,
      data: request.content.data,
      at: response.notification.date,
    };
  }
  const data = (payload as { data?: { dataString?: string; [key: string]: unknown } }).data;
  let body: unknown = data;
  if (typeof data?.dataString === 'string') {
    try {
      body = JSON.parse(data.dataString) as unknown;
    } catch {
      return null;
    }
  } else if (data !== undefined && typeof data['body'] === 'object') {
    body = data['body'];
  } else if (data !== undefined && typeof data['body'] === 'string') {
    // Android: FCM's data message carries the push's data as JSON under `body`.
    try {
      body = JSON.parse(data['body']) as unknown;
    } catch {
      return null;
    }
  }
  const refresh = SurfaceRefreshData.safeParse(body);
  return refresh.success ? { kind: 'refresh', data: refresh.data } : null;
}

// Defined when the app's code loads, as iOS may wake the app for it before anything mounts.
TaskManager.defineTask<unknown>(SURFACES_TASK, async ({ data, error }) => {
  if (error) return Notifications.BackgroundNotificationTaskResult.Failed;
  const event = readWoken(data);
  if (event === null) return Notifications.BackgroundNotificationTaskResult.NoData;
  await deliver(event);
  return Notifications.BackgroundNotificationTaskResult.NewData;
});

/** Asks iOS to run the task for pushes; once per launch is enough. */
export async function registerBackgroundTask(): Promise<void> {
  if (!(await TaskManager.isTaskRegisteredAsync(SURFACES_TASK))) {
    await Notifications.registerTaskAsync(SURFACES_TASK);
  }
}
