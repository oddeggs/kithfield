import type { Bindings } from './env';

/** The queues in `wrangler.jsonc`, by their name without the `kithfield-` prefix and `-dev` suffix. */
export const queueNames = ['push', 'media-jobs', 'ai', 'deletion'] as const;
export type QueueName = (typeof queueNames)[number];

export type QueueHandler = (
  batch: MessageBatch,
  env: Bindings,
  ctx: ExecutionContext,
) => Promise<void>;

/** `kithfield-push-dev` → `push`; a queue this Worker does not know → undefined. */
export function queueNameOf(queue: string): QueueName | undefined {
  const bare = queue.replace(/^kithfield-/, '').replace(/-dev$/, '');
  return queueNames.find((name) => name === bare);
}

/** Each queue's consumer, registered here as it is built. */
const handlers: Partial<Record<QueueName, QueueHandler>> = {};

/** Hands a batch to its queue's consumer. Without one, the batch is retried rather than acked. */
export async function consumeQueue(
  batch: MessageBatch,
  env: Bindings,
  ctx: ExecutionContext,
): Promise<void> {
  const name = queueNameOf(batch.queue);
  const handler = name === undefined ? undefined : handlers[name];
  if (handler === undefined) {
    console.warn('no consumer for queue', { queue: batch.queue });
    batch.retryAll();
    return;
  }
  await handler(batch, env, ctx);
}
