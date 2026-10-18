import { AiFeature, ConsentList, ConsentRequest, EpochMs, PersonId } from '@kithfield/contracts';
import { Hono } from 'hono';
import { z } from 'zod';

import { registerDeletionJob } from '../deletion';
import type { Bindings } from '../env';
import { registerMergeStep } from './merge-steps';
import { errorResponse, requireSession, type SessionEnv } from './session';

/*
 * Consent for the AI features that send words or voices out (captions, the Sunday recap), asked
 * per person before anything is sent:
 * - `PUT /v1/me/consents/:feature {allowed, textVersion}` records the answer (204).
 * - `GET /v1/me/consents` lists the answers.
 * - `POST /v1/me/consents/:feature/forget` (202): the person says no and asks for what was already
 *   sent to be deleted. The consent is withdrawn at once; the deletion runs on the `deletion`
 *   queue (`consent_forget`), through the steps the AI features register.
 */

/** On the `deletion` queue: delete what was sent or made for a feature. Local to the API. */
export const ConsentForgetJob = z.object({
  kind: z.literal('consent_forget'),
  person: PersonId,
  feature: AiFeature,
  at: EpochMs,
});
export type ConsentForgetJob = z.infer<typeof ConsentForgetJob>;

/**
 * Deletes what one AI feature keeps for a person (captions, recaps, anything sent to the
 * provider) and asks the provider to delete its copy. The AI work registers one per feature as
 * it lands; until then nothing has been sent, so there is nothing to delete.
 */
export type AiForgetStep = (env: Bindings, job: ConsentForgetJob) => Promise<void>;

const forgetSteps = new Map<string, AiForgetStep>();

/** Adds a step under a unique name; the returned function removes it again. */
export function registerAiForgetStep(name: string, step: AiForgetStep): () => void {
  if (forgetSteps.has(name)) throw new Error(`an AI forget step named ${name} is registered`);
  forgetSteps.set(name, step);
  return () => {
    forgetSteps.delete(name);
  };
}

registerDeletionJob('consent_forget', ConsentForgetJob, async (env, job) => {
  for (const step of forgetSteps.values()) await step(env, job);
});

/** The version recorded for a feature the person never answered before saying forget. */
const NO_TEXT_VERSION = 'none';

type ConsentRow = { feature: string; allowed: number; text_version: string; at: number };

export async function listConsents(db: D1Database, person: string): Promise<ConsentList> {
  const { results } = await db
    .prepare(
      'SELECT feature, allowed, text_version, at FROM consents WHERE person_id = ? ORDER BY feature',
    )
    .bind(person)
    .all<ConsentRow>();
  return ConsentList.parse({
    consents: results.map((r) => ({
      feature: r.feature,
      allowed: r.allowed === 1,
      textVersion: r.text_version,
      at: r.at,
    })),
  });
}

/** A merge keeps the returning person's answers, and takes the anonymous person's where they had none. */
registerMergeStep('consents', (db, { from, into }) => [
  db
    .prepare(
      `INSERT OR IGNORE INTO consents (person_id, feature, allowed, text_version, at, forgotten_at)
       SELECT ?2, feature, allowed, text_version, at, forgotten_at FROM consents WHERE person_id = ?1`,
    )
    .bind(from, into),
  db.prepare('DELETE FROM consents WHERE person_id = ?').bind(from),
]);

export function consentRoutes(): Hono<SessionEnv> {
  const routes = new Hono<SessionEnv>();

  routes.get('/v1/me/consents', requireSession, async (c) =>
    c.json((await listConsents(c.env.DB, c.var.person)) satisfies ConsentList),
  );

  routes.put('/v1/me/consents/:feature', requireSession, async (c) => {
    const feature = AiFeature.safeParse(c.req.param('feature'));
    if (!feature.success) return errorResponse(c, 404, 'not_found');
    const body = ConsentRequest.safeParse(await c.req.json().catch(() => undefined));
    if (!body.success) {
      const fields = body.error.issues.map((issue) => issue.path.join('.')).slice(0, 50);
      return errorResponse(c, 400, 'bad_request', fields);
    }
    await c.env.DB.prepare(
      `INSERT INTO consents (person_id, feature, allowed, text_version, at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (person_id, feature) DO UPDATE SET allowed = excluded.allowed,
         text_version = excluded.text_version, at = excluded.at`,
    )
      .bind(
        c.var.person,
        feature.data,
        Number(body.data.allowed),
        body.data.textVersion,
        Date.now(),
      )
      .run();
    return c.body(null, 204);
  });

  routes.post('/v1/me/consents/:feature/forget', requireSession, async (c) => {
    const feature = AiFeature.safeParse(c.req.param('feature'));
    if (!feature.success) return errorResponse(c, 404, 'not_found');
    const now = Date.now();
    await c.env.DB.prepare(
      `INSERT INTO consents (person_id, feature, allowed, text_version, at, forgotten_at)
       VALUES (?1, ?2, 0, ?3, ?4, ?4)
       ON CONFLICT (person_id, feature) DO UPDATE SET allowed = 0, at = excluded.at,
         forgotten_at = excluded.forgotten_at`,
    )
      .bind(c.var.person, feature.data, NO_TEXT_VERSION, now)
      .run();
    const job: ConsentForgetJob = {
      kind: 'consent_forget',
      person: c.var.person,
      feature: feature.data,
      at: now,
    };
    try {
      await c.env.DELETION_QUEUE.send(job);
    } catch {
      return errorResponse(c, 503, 'unavailable');
    }
    return c.body(null, 202);
  });

  return routes;
}
