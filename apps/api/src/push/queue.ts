import { FarmId, PersonId, type PushJob, SurfaceRefreshData } from '@kithfield/contracts';
import { z } from 'zod';

import type { Bindings } from '../env';

/**
 * Tickets to check about 15 minutes after a send, as Expo advises. Rides the same `push` queue
 * as the jobs, delayed.
 */
export const ReceiptCheck = z.object({
  receipts: z
    .array(
      z.object({
        ticket: z.string().min(1).max(128),
        person: PersonId,
        device: z.string().min(1).max(64),
        token: z.string().min(1).max(256),
      }),
    )
    .min(1)
    .max(1000),
});
export type ReceiptCheck = z.infer<typeof ReceiptCheck>;

/**
 * A silent push asking the person's phones to redraw their widgets (`SurfaceRefreshData`), from
 * the cottage, which spaces them out. Never an alert, never in the budget or the ledger.
 */
export const SurfaceRefreshJob = z.object({
  surfaceRefresh: SurfaceRefreshData.extend({ person: PersonId, farm: FarmId }),
});
export type SurfaceRefreshJob = z.infer<typeof SurfaceRefreshJob>;

export type PushQueueMessage = PushJob | ReceiptCheck | SurfaceRefreshJob;

/** Expo's receipts are ready within 15 minutes of a send. */
export const RECEIPT_DELAY_SECONDS = 15 * 60;

/** Puts a message on the `push` queue. */
export function enqueuePush(
  env: Bindings,
  body: PushQueueMessage,
  delaySeconds?: number,
): Promise<void> {
  return pushQueue.send(env, body, delaySeconds);
}

/**
 * The queue producer. Tests replace `send` with a recorder so nothing reaches the local queue,
 * whose consumer would call Expo.
 */
export const pushQueue = {
  send: async (env: Bindings, body: PushQueueMessage, delaySeconds?: number): Promise<void> => {
    await env.PUSH_QUEUE.send(body, delaySeconds === undefined ? {} : { delaySeconds });
  },
};
