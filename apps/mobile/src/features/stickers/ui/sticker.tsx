import { ArtLoop, ArtStill } from '../../../ui/art/art-view';

/** The moment a held sticker shows: the renderer's own still moment, as `ArtLoop` holds it. */
const STILL_T = 1.2;

/**
 * One sticker, looping on twos while it is on screen. `still` draws only the held frame, for
 * stickers scrolled out of view, so their loops are never baked.
 */
export function StickerArt({
  attrs,
  size,
  still = false,
  paused = false,
}: {
  readonly attrs: Readonly<Record<string, string>>;
  readonly size: number;
  readonly still?: boolean;
  readonly paused?: boolean;
}) {
  if (still) {
    return <ArtStill scene="sticker" width={size} height={size} attrs={attrs} t={STILL_T} />;
  }
  return <ArtLoop scene="sticker" width={size} height={size} attrs={attrs} paused={paused} />;
}
