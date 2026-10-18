import type { Bindings } from '../env';

/*
 * Where the cottage meets code built alongside it: sign-in (sessions and socket tokens) and the
 * farms (writing `hibernate`). Each starts closed, so nothing is let in or claimed done before the
 * real implementation is wired.
 *
 * Wire them at MODULE scope, in this file (`current = {...}` below, importing auth and the farm
 * code), so every isolate that loads it, the Durable Objects' included, gets them. A call made
 * inside a request handler only reaches that handler's isolate.
 */

/** Which socket a token is for: auth's `RtTokenScope` for a cottage. */
export interface CottageTokenScope {
  readonly cottage: string;
}

export interface CottageAdapters {
  /**
   * Auth's `verifyRtToken(env, token, scope)`: the person a 5-minute socket token was issued to
   * for this scope, or null when it is invalid, expired or for another socket.
   */
  readonly verifyRtToken: (
    env: Bindings,
    token: string,
    scope: CottageTokenScope,
  ) => Promise<string | null>;
  /** The signed-in person behind a request's session (its bearer token), or null. */
  readonly sessionPerson: (request: Request, env: Bindings) => Promise<string | null>;
  /** Writes `hibernate {on}` on every farm the person lives on (the farms skip a non-change). */
  readonly fanOutHibernate: (env: Bindings, person: string, on: boolean) => Promise<void>;
}

const closed: CottageAdapters = {
  verifyRtToken: () => Promise.resolve(null),
  sessionPerson: () => Promise.resolve(null),
  fanOutHibernate: (_env, person) => {
    console.warn('hibernate fan-out is not wired; the farms were not told', { person });
    return Promise.resolve();
  },
};

let current: CottageAdapters = closed;

export function cottageAdapters(): CottageAdapters {
  return current;
}

/**
 * Replaces adapters, at module load (production wiring above) or in tests (a named double; the
 * Workers test pool runs tests and objects in one isolate).
 */
export function useCottageAdapters(adapters: Partial<CottageAdapters>): void {
  current = { ...current, ...adapters };
}
