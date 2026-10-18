import type { FarmCommand, PersonId, RejectReason } from '@kithfield/contracts';

import type { Bindings } from '../env';
import { blocks } from './blocks';
import { roleOf } from './d1';

/*
 * Checks on a phone's write that need more than the farm's own log: whom a gesture is addressed
 * to (blocks), and whose media it names (another farm's media). Asked once, before the write's
 * first answer is stored; a retried op id keeps that answer.
 */

/** Gestures addressed to one person, refused between two people where either blocked the other. */
const ADDRESSED: ReadonlySet<string> = new Set([
  'firefly',
  'gift',
  'slow_post',
  'knock',
  'hug',
  'wave',
  'quiet_note',
]);

/** The media keys a write names. */
const keysOf = (cmd: FarmCommand): string[] => {
  if (cmd.kind === 'media') return cmd.payload.items.map((item) => item.key);
  if (cmd.kind === 'voice') return [cmd.payload.audio.key];
  if (cmd.kind === 'link' && cmd.payload.preview?.image !== undefined) {
    return [cmd.payload.preview.image.key];
  }
  return [];
};

const prefixOf = (farm: string) => `farm/${farm}/`;

/**
 * A write may name only its own farm's media, so unsending it or deleting its author's account
 * never deletes another farm's. The exception is a forward: media from the farm it was forwarded
 * from, when the writer lives there too.
 */
const mediaRefusal = async (
  env: Bindings,
  farm: string,
  cmd: FarmCommand,
  actor: PersonId,
): Promise<RejectReason | null> => {
  const foreign = keysOf(cmd).filter((key) => !key.startsWith(prefixOf(farm)));
  if (foreign.length === 0) return null;
  const from = (cmd.payload as { forwardedFrom?: { farm?: unknown } }).forwardedFrom?.farm;
  if (typeof from !== 'string' || from === farm) return 'not_allowed';
  if (foreign.some((key) => !key.startsWith(prefixOf(from)))) return 'not_allowed';
  return (await roleOf(env.DB, from, actor)) === null ? 'not_allowed' : null;
};

/** Why the write is refused before the farm's rules see it, or null. */
export const refusalOf = async (
  env: Bindings,
  farm: string,
  cmd: FarmCommand,
  actor: PersonId,
  personOf: (id: PersonId) => PersonId,
): Promise<RejectReason | null> => {
  const media = await mediaRefusal(env, farm, cmd, actor);
  if (media !== null) return media;
  const to = (cmd.payload as { to?: unknown }).to;
  if (!ADDRESSED.has(cmd.kind) || typeof to !== 'string') return null;
  const recipient = personOf(to);
  if (recipient === actor) return null;
  return (await blocks.isBlocked(env, actor, recipient)) ? 'unavailable' : null;
};
