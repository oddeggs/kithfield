import type { Internals } from '@kithfield/art';

/** Where the design's `avatar` scene puts a critter in its circle (`kithfield-art.js`, `S.avatar`). */
export interface AvatarFrame {
  /** The kind drawn: unknown kinds fall back to the rabbit, as the renderer does. */
  kind: string;
  /** The size the critter is drawn at, larger than the circle so its head fills it. */
  critterSize: number;
  /** 1 faces right; the hedgehog and the sheep face left. */
  dir: 1 | -1;
  /** Where the critter's feet go so its head sits a little above the circle's middle. */
  headX: number;
  headY: number;
  tint: string;
}

type AvatarInternals = Pick<Internals, 'CR' | 'COATS'>;

/** The critter's place in a `size`-point avatar, as the renderer's own avatar scene draws it. */
export function avatarFrame(
  I: AvatarInternals,
  kind: string,
  size: number,
  coat?: string,
): AvatarFrame {
  const k = I.CR[kind] ? kind : 'rabbit';
  const def = I.CR[k];
  const az = typeof def?.['az'] === 'number' ? def['az'] : 1;
  const dir = k === 'hedgehog' || k === 'sheep' ? -1 : 1;
  const critterSize = size * 1.6 * az;
  const kk = Math.round(critterSize) / 100;
  const [hx, hy] = def?.head ?? [0, 0];
  const coatTint = coat ? I.COATS[k]?.[coat]?.['tint'] : undefined;
  return {
    kind: k,
    critterSize,
    dir,
    headX: size / 2 - hx * kk * dir,
    headY: size * 0.53 - hy * kk,
    tint: coatTint ?? def?.tint ?? AVATAR_PAPER,
  };
}

/** Behind a critter the renderer has no tint for: the paper of the critter sprites. */
export const AVATAR_PAPER = '#fbf5ea';
