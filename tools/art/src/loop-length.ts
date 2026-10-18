import { LOOP_FRAMES } from '@kithfield/art/stickers';

/** Two seconds at 30 fps, for a pose without a measured loop. */
const DEFAULT_FRAMES = 60;

/** Frames in a pose's loop at 30 fps (`pnpm --filter @kithfield/art-tools loops`). */
export function loopFrames(pose: string): number {
  return LOOP_FRAMES[pose] ?? DEFAULT_FRAMES;
}
