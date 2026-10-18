import type { Bindings } from '../env';

/*
 * Where the cottage meets code built alongside it: sign-in (sessions and socket tokens) and the
 * farms (writing `hibernate`). Each starts closed, so nothing is let in or claimed done before
 * the real implementation is wired here; the Worker's entry wires them with `useCottageAdapters`.
 */

/** What a socket token from `POST /v1/rt-token` says. A cottage token has no farm. */
export interface RtTokenClaims {
  readonly person: string;
  readonly farm: string | null;
}

export interface CottageAdapters {
  /** Checks a 5-minute socket token: who it is for, or null when it is invalid or expired. */
  readonly verifyRtToken: (env: Bindings, token: string) => Promise<RtTokenClaims | null>;
  /** The signed-in person behind a request's session (its bearer token), or null. */
  readonly sessionPerson: (request: Request, env: Bindings) => Promise<string | null>;
  /** Writes `hibernate {on}` on every farm the person lives on (the farms decide if it changed). */
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

/** Wires the real sign-in and farm code (or, in tests, a named double). */
export function useCottageAdapters(adapters: Partial<CottageAdapters>): void {
  current = { ...current, ...adapters };
}
