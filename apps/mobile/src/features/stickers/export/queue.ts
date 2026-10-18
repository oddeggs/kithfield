/** Runs jobs one after another: each starts once the one before has finished, failed or not. */
export function serialQueue(): <T>(job: () => Promise<T>) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(job: () => Promise<T>): Promise<T> => {
    const next = tail.then(job, job);
    tail = next.catch(() => undefined);
    return next;
  };
}

/**
 * The one queue every sticker bake goes through (the Messages drawer, WhatsApp, Photos), so two
 * bakes never hold their frames in memory at the same time.
 */
export const bakeQueue = serialQueue();
