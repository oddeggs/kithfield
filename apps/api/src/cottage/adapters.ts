import type { MiddlewareHandler } from 'hono';

import { requireSession, verifyRtToken } from '../auth';
import type { Bindings } from '../env';
import { hibernateOnFarms } from '../farm/hibernate';

/*
 * Where the cottage meets code built alongside it: sign-in (sessions and socket tokens) and the
 * farms (writing `hibernate`). The production wiring is set here at MODULE scope, so every isolate
 * that loads this file, the Durable Objects' included, gets it. Tests swap in named doubles with
 * `useCottageAdapters`; the Workers test pool runs tests and objects in one isolate.
 */

/** Which socket a token is for: auth's `RtTokenScope` for a cottage. */
export interface CottageTokenScope {
  readonly cottage: string;
}

/**
 * What a route behind a session sees: the signed-in person's id as `c.var.person`, and the
 * session's id as `c.var.session`.
 */
export type SessionRouteEnv = {
  Bindings: Bindings;
  Variables: { person: string; session: string };
};

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
  /**
   * Lets a request through only with a signed-in session and sets `person`: auth's
   * `requireSession` (401 without a session, 403 for a banned person).
   */
  readonly requireSession: MiddlewareHandler<SessionRouteEnv>;
  /** Writes `hibernate {on}` on every farm the person lives on (the farms skip a non-change). */
  readonly fanOutHibernate: (env: Bindings, person: string, on: boolean) => Promise<void>;
}

const production: CottageAdapters = {
  verifyRtToken: (env, token, scope) => verifyRtToken(env, token, scope),
  requireSession,
  fanOutHibernate: hibernateOnFarms,
};

let current: CottageAdapters = production;

export function cottageAdapters(): CottageAdapters {
  return current;
}

/** Replaces adapters: in tests, with a named double. */
export function useCottageAdapters(adapters: Partial<CottageAdapters>): void {
  current = { ...current, ...adapters };
}

/** Puts the production wiring back, for a test that ran with doubles. */
export function useProductionCottageAdapters(): void {
  current = production;
}
