/**
 * One start shared by everyone who asks, held for the whole process rather than by the component
 * that asked first: a remount, a second mount or an effect run twice all get the same runtime
 * instead of opening the store and the sockets a second time. A start that fails is forgotten so
 * the next ask tries again; `reset` forgets a finished one (signing out, Try again).
 */
export interface StartOnce<T> {
  readonly start: () => Promise<T>;
  readonly reset: () => void;
}

export function createStartOnce<T>(begin: () => Promise<T>): StartOnce<T> {
  let started: Promise<T> | null = null;
  return {
    start: () => {
      if (started) return started;
      const attempt: Promise<T> = begin().catch((error: unknown) => {
        // Only this attempt is forgotten: a reset and a newer start may already have replaced it.
        if (started === attempt) started = null;
        throw error;
      });
      started = attempt;
      return attempt;
    },
    reset: () => {
      started = null;
    },
  };
}
