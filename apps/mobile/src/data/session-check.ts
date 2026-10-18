/**
 * The session re-check a 401 asks for, one at a time: a burst of 401s (every farm's token, the
 * outbox, a screen's call) shares the check that is running. `check` answers whether the session
 * is still live; it is the one that ends the session (and wipes) when the server confirms it is
 * gone. A check that fails (no network) counts as not live for that call, and wipes nothing.
 */
export function sessionRecheck(check: () => Promise<boolean>): () => Promise<boolean> {
  let running: Promise<boolean> | null = null;
  return () => {
    running ??= check()
      .catch(() => false)
      .finally(() => {
        running = null;
      });
    return running;
  };
}
