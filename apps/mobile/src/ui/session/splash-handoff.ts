import { motion } from '@kithfield/theme';

/*
 * How the launch screen hands off to the app (`13 Launch`, cold and warm start). It stays up until
 * the shell has laid out with the session known and no screen still holds it: the farm home holds
 * it until its reveal has drawn its first frame (a cold start: the paper under the splash is the
 * reveal's first frame), or until the farm itself is drawn (a warm start, no draw-in).
 */

/** The cross-fade into the app: the warm start's, or Reduce Motion's fade. */
export function splashFadeMs(reduce: boolean): number {
  return reduce ? motion.fade.durationMs : motion.cross.durationMs;
}

/** However slow a screen is, the splash goes this long after the shell is ready. */
export const SPLASH_MAX_HOLD_MS = 3000;

export interface SplashHandoff {
  /** A screen that draws in by itself keeps the splash up; call the answer once it has drawn. */
  hold(): () => void;
  /** The shell has laid out with the session known: the splash goes once nothing holds it. */
  ready(): void;
  readonly hidden: boolean;
}

export function createSplashHandoff(deps: {
  readonly hide: () => void;
  readonly setTimer: (fn: () => void, ms: number) => () => void;
}): SplashHandoff {
  let hidden = false;
  let isReady = false;
  let holds = 0;
  let cancelLimit: (() => void) | null = null;

  const hide = () => {
    if (hidden) return;
    hidden = true;
    cancelLimit?.();
    cancelLimit = null;
    deps.hide();
  };
  const settle = () => {
    if (isReady && holds === 0) hide();
  };

  return {
    hold() {
      if (hidden) return () => undefined;
      holds += 1;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        holds -= 1;
        settle();
      };
    },
    ready() {
      if (isReady || hidden) return;
      isReady = true;
      if (holds > 0) cancelLimit = deps.setTimer(hide, SPLASH_MAX_HOLD_MS);
      settle();
    },
    get hidden() {
      return hidden;
    },
  };
}
