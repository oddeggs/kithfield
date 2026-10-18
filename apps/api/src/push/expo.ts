import type { NotificationCategory } from '@kithfield/contracts';
import { z } from 'zod';

/*
 * Expo's push service: it sends to APNs and FCM. Up to 100 messages a request; each answers
 * with a ticket, and the ticket's receipt is ready within 15 minutes.
 * https://docs.expo.dev/push-notifications/sending-notifications/
 */

export const EXPO_SEND_URL = 'https://exp.host/--/api/v2/push/send';
export const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
export const EXPO_MESSAGES_PER_REQUEST = 100;
export const EXPO_RECEIPTS_PER_REQUEST = 1000;

/** The fields of Expo's message format Kithfield uses. */
export interface ExpoMessage {
  readonly to: string;
  readonly title: string;
  readonly body: string;
  readonly data: Readonly<Record<string, string | number | null>>;
  /** Omitted for a quiet push. */
  readonly sound?: 'default';
  /** iOS `apns-collapse-id`: replaces a push already shown with the same id. */
  readonly collapseId: string;
  /** Android's equivalent of replacing what is shown. */
  readonly tag: string;
  /** Groups a farm's pushes together on iOS. */
  readonly threadId: string;
  readonly interruptionLevel: 'active' | 'passive';
  readonly priority: 'high' | 'normal';
  /** Seconds the push may wait for an offline phone. */
  readonly ttl: number;
  /** The `NotificationCategory` whose actions a long-press offers; omitted for none. */
  readonly categoryId?: NotificationCategory;
  /** Lets the notification service extension attach the farm's or seed's still. */
  readonly mutableContent?: true;
}

/**
 * A silent push: no alert, no sound, no badge. iOS wakes the app in the background with `data`,
 * at a rate it decides itself.
 */
export interface ExpoSilentMessage {
  readonly to: string;
  readonly data: Readonly<Record<string, string | number | null>>;
  readonly _contentAvailable: true;
  readonly priority: 'normal';
  readonly collapseId: string;
  readonly ttl: number;
}

const ExpoError = z.object({
  status: z.literal('error'),
  message: z.string().optional(),
  details: z.looseObject({ error: z.string().optional() }).optional(),
});

export const ExpoTicket = z.union([
  z.object({ status: z.literal('ok'), id: z.string() }),
  ExpoError,
]);
export type ExpoTicket = z.infer<typeof ExpoTicket>;

export const ExpoReceipt = z.union([z.object({ status: z.literal('ok') }), ExpoError]);
export type ExpoReceipt = z.infer<typeof ExpoReceipt>;

/** What an exchange with Expo came to: its answer, a failure worth retrying, or a refusal. */
export type ExpoResult<T> =
  | { readonly kind: 'ok'; readonly value: T }
  | { readonly kind: 'retry'; readonly why: string }
  | { readonly kind: 'refused'; readonly why: string };

/** The error code Expo gives a ticket or receipt, such as `DeviceNotRegistered`. */
export function errorCodeOf(answer: ExpoTicket | ExpoReceipt): string | null {
  return answer.status === 'error' ? (answer.details?.error ?? 'error') : null;
}

/** Errors that clear up by themselves: the push is sent again later. */
export const RETRYABLE_ERRORS: ReadonlySet<string> = new Set(['MessageRateExceeded']);

async function post<T>(
  fetcher: typeof fetch,
  url: string,
  payload: unknown,
  accessToken: string | undefined,
  read: (json: unknown) => T,
): Promise<ExpoResult<T>> {
  let response: Response;
  try {
    response = await fetcher(url, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        ...(accessToken === undefined ? {} : { authorization: `Bearer ${accessToken}` }),
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    return { kind: 'retry', why: `network: ${String(error)}` };
  }
  if (response.status === 429 || response.status >= 500) {
    return { kind: 'retry', why: `http_${response.status}` };
  }
  if (!response.ok) return { kind: 'refused', why: `http_${response.status}` };
  try {
    return { kind: 'ok', value: read(await response.json()) };
  } catch {
    return { kind: 'retry', why: 'unreadable_answer' };
  }
}

/** Sends up to 100 messages; the tickets come back in the same order. */
export function sendToExpo(
  fetcher: typeof fetch,
  messages: readonly (ExpoMessage | ExpoSilentMessage)[],
  accessToken?: string,
): Promise<ExpoResult<ExpoTicket[]>> {
  return post(fetcher, EXPO_SEND_URL, messages, accessToken, (json) => {
    const tickets = z.object({ data: z.array(ExpoTicket) }).parse(json).data;
    if (tickets.length !== messages.length) throw new Error('A ticket per message');
    return tickets;
  });
}

/** Up to 1000 receipts by ticket id. A ticket without a receipt yet is missing from the map. */
export function fetchReceipts(
  fetcher: typeof fetch,
  ids: readonly string[],
  accessToken?: string,
): Promise<ExpoResult<Record<string, ExpoReceipt>>> {
  return post(
    fetcher,
    EXPO_RECEIPTS_URL,
    { ids },
    accessToken,
    (json) => z.object({ data: z.record(z.string(), ExpoReceipt) }).parse(json).data,
  );
}
