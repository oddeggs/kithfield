import type { FarmCommand, PersonId, RejectReason } from '@kithfield/contracts';

import { eitherBlocked } from '../auth';
import type { Bindings } from '../env';
import { claimGift, claimOf, farmOwnsTheme } from '../purchases/gift-claims';

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
  // A farm theme is shown only once the farm owns it (friends' chip-in covered it).
  if (
    cmd.kind === 'settings_changed' &&
    cmd.payload.setting === 'theme' &&
    cmd.payload.theme !== null &&
    !(await farmOwnsTheme(env.DB, farm, cmd.payload.theme))
  ) {
    return 'not_allowed';
  }
  const to = (cmd.payload as { to?: unknown }).to;
  if (!ADDRESSED.has(cmd.kind) || typeof to !== 'string') return null;
  const recipient = personOf(to);
  if (recipient !== actor && (await eitherBlocked(env.DB, actor, recipient))) return 'unavailable';
  // A gift id is taken only from its giver, paid and not given yet: claimed now, released by the
  // caller if the farm refuses the write after all.
  const claim = claimOf(cmd, actor);
  if (claim !== null && !(await claimGift(env.DB, claim, Date.now()))) return 'not_found';
  return null;
};
