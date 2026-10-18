import type { CritterChangedPayload, OpId, PersonId } from '@kithfield/contracts';

import { registerProfileFanOut } from '../auth';
import type { Bindings } from '../env';
import { farmStub } from './http';

/*
 * A person changed their name, critter or birthday: every farm they live on writes
 * `critter_changed` with exactly what changed, on their behalf. Each farm's write has an op id made
 * from the person, the farm and the change (its time on `people`), so telling a farm twice about
 * one change writes it once, while a later change back to an old name is a change of its own.
 */

const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

/** A UUIDv7 drawn from `seed`, with `at` as its time: the same inputs always give the same id. */
export const opIdFrom = async (at: number, seed: string): Promise<OpId> => {
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(seed)),
  );
  const bytes = digest.slice(0, 16);
  let ms = at;
  for (let i = 5; i >= 0; i--) {
    bytes[i] = ms % 256;
    ms = Math.floor(ms / 256);
  }
  bytes[6] = 0x70 | ((bytes[6] ?? 0) & 0x0f);
  bytes[8] = 0x80 | ((bytes[8] ?? 0) & 0x3f);
  const h = hex(bytes);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};

/** Tells every farm the person lives on; one farm failing is logged and never stops the rest. */
export const tellFarmsOfProfile = async (
  env: Bindings,
  person: PersonId,
  changed: CritterChangedPayload,
): Promise<void> => {
  const row = await env.DB.prepare('SELECT updated_at FROM people WHERE id = ?')
    .bind(person)
    .first<{ updated_at: string | number }>();
  const changedAt = row === null ? Date.now() : new Date(row.updated_at).getTime();
  const change = `${changedAt}:${JSON.stringify(changed)}`;
  const { results } = await env.DB.prepare(
    'SELECT farm_id FROM memberships WHERE person_id = ? AND left_at IS NULL',
  )
    .bind(person)
    .all<{ farm_id: string }>();
  const outcomes = await Promise.allSettled(
    results.map(async ({ farm_id }) => {
      const opId = await opIdFrom(changedAt, `${person}:${farm_id}:${change}`);
      await farmStub(env, farm_id).profileChanged(person, opId, changed);
    }),
  );
  for (const outcome of outcomes) {
    if (outcome.status === 'rejected') {
      console.error('farm profile change failed', {
        error: outcome.reason instanceof Error ? outcome.reason.message : 'unknown',
      });
    }
  }
};

registerProfileFanOut(tellFarmsOfProfile);
