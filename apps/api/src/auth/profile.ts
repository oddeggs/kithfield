import { Critter, type CritterChangedPayload, type MeProfileUpdate } from '@kithfield/contracts';

import type { Bindings } from '../env';

/**
 * The person's name, critter and birthday: stored on `people`, then told to every farm they live
 * on as `critter_changed`, carrying only what changed.
 *
 * The farms are told through fan-outs other parts of the API register (the farm object writes the
 * event on the person's behalf). They run after the D1 write, side by side; one failing is logged
 * and doesn't stop the others or undo the change, which `GET /v1/me` already shows.
 */

export type ProfileFanOut = (
  env: Bindings,
  person: string,
  changed: CritterChangedPayload,
) => Promise<void>;

const fanOuts = new Set<ProfileFanOut>();

/** Adds a fan-out; the returned function removes it again. */
export function registerProfileFanOut(fanOut: ProfileFanOut): () => void {
  fanOuts.add(fanOut);
  return () => {
    fanOuts.delete(fanOut);
  };
}

/**
 * Whether the person may wear a critter: the shop registers a check that what is newly worn from
 * Rocco's cart is theirs (`before` is the critter worn now, or null). With none registered, all is.
 */
export type WardrobeCheck = (
  env: Bindings,
  person: string,
  critter: Critter,
  before: Critter | null,
) => Promise<boolean>;

let wardrobeCheck: WardrobeCheck | null = null;

/** Sets the wardrobe check; the returned function removes it again. */
export function registerWardrobeCheck(check: WardrobeCheck): () => void {
  wardrobeCheck = check;
  return () => {
    if (wardrobeCheck === check) wardrobeCheck = null;
  };
}

/** False when the update would put on something from the cart the person doesn't own. */
export async function mayWear(env: Bindings, person: string, update: MeProfileUpdate) {
  if (update.critter === undefined || wardrobeCheck === null) return true;
  const row = await env.DB.prepare('SELECT critter FROM people WHERE id = ?')
    .bind(person)
    .first<{ critter: string | null }>();
  const parsed = row?.critter ? Critter.safeParse(JSON.parse(row.critter)) : null;
  return wardrobeCheck(env, person, update.critter, parsed?.success ? parsed.data : null);
}

/** A critter as stored: its fields in the schema's order, so equal critters store equal text. */
function critterJson(critter: Critter): string {
  return JSON.stringify(Critter.parse(critter));
}

interface ProfileRow {
  display_name: string | null;
  critter: string | null;
  birthday: string | null;
}

/** What the update changes against what is stored; empty when it changes nothing. */
function changesOf(row: ProfileRow, update: MeProfileUpdate): Partial<CritterChangedPayload> {
  const changed: { name?: string; critter?: Critter; birthday?: string | null } = {};
  if (update.name !== undefined && update.name !== row.display_name) changed.name = update.name;
  if (update.critter !== undefined && critterJson(update.critter) !== row.critter) {
    changed.critter = update.critter;
  }
  if (update.birthday !== undefined && update.birthday !== row.birthday) {
    changed.birthday = update.birthday;
  }
  return changed;
}

function isChange(changed: Partial<CritterChangedPayload>): changed is CritterChangedPayload {
  return Object.keys(changed).length > 0;
}

async function tellFarms(env: Bindings, person: string, changed: CritterChangedPayload) {
  const outcomes = await Promise.allSettled(
    [...fanOuts].map((fanOut) => fanOut(env, person, changed)),
  );
  for (const outcome of outcomes) {
    if (outcome.status === 'rejected') {
      console.error('profile fan-out failed', {
        person,
        keys: Object.keys(changed),
        error: outcome.reason as unknown,
      });
    }
  }
}

/**
 * Stores what the update changes and tells the farms. Answers what changed; nothing is written
 * and no farm is told when nothing did. Null when the person is gone.
 */
export async function updateProfile(
  env: Bindings,
  person: string,
  update: MeProfileUpdate,
): Promise<Partial<CritterChangedPayload> | null> {
  const row = await env.DB.prepare(
    'SELECT display_name, critter, birthday FROM people WHERE id = ?',
  )
    .bind(person)
    .first<ProfileRow>();
  if (row === null) return null;
  const changed = changesOf(row, update);
  if (!isChange(changed)) return changed;

  const columns: string[] = [];
  const values: (string | null)[] = [];
  if (changed.name !== undefined) {
    columns.push('display_name = ?');
    values.push(changed.name);
  }
  if (changed.critter !== undefined) {
    columns.push('critter = ?');
    values.push(critterJson(changed.critter));
  }
  if (changed.birthday !== undefined) {
    columns.push('birthday = ?');
    values.push(changed.birthday);
  }
  await env.DB.prepare(`UPDATE people SET ${columns.join(', ')}, updated_at = ? WHERE id = ?`)
    .bind(...values, new Date().toISOString(), person)
    .run();
  await tellFarms(env, person, changed);
  return changed;
}
