import type { FarmCommand, PersonId, RejectReason } from '@kithfield/contracts';

import { eitherBlocked } from '../auth';
import type { Bindings } from '../env';

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
 * never deletes another farm's. A forward is no exception: the phone copies the media into this
 * farm first (`POST /v1/media/copy`) and sends the copies' keys.
 */
const mediaRefusal = (farm: string, cmd: FarmCommand): RejectReason | null =>
  keysOf(cmd).every((key) => key.startsWith(prefixOf(farm))) ? null : 'not_allowed';

/** Why the write is refused before the farm's rules see it, or null. */
export const refusalOf = async (
  env: Bindings,
  farm: string,
  cmd: FarmCommand,
  actor: PersonId,
  personOf: (id: PersonId) => PersonId,
): Promise<RejectReason | null> => {
  const media = mediaRefusal(farm, cmd);
  if (media !== null) return media;
  const to = (cmd.payload as { to?: unknown }).to;
  if (!ADDRESSED.has(cmd.kind) || typeof to !== 'string') return null;
  const recipient = personOf(to);
  if (recipient === actor) return null;
  return (await eitherBlocked(env.DB, actor, recipient)) ? 'unavailable' : null;
};
