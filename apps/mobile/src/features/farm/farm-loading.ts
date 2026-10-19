import { useCallback, useEffect, useRef, useState } from 'react';

/** A farm that arrives sooner than this shows no loader at all (`12 States`, loading). */
export const LOADER_AFTER_MS = 300;

/**
 * Whether the farm is drawing itself in. The farm is ready once it is on the phone (`data`) and
 * its scene is drawn (`drawn`, the art baked); one ready within the loader's wait shows nothing
 * extra. Otherwise paper covers it until the reveal says it is done, with the pencil rows only
 * while nothing of the farm is on the phone. The wait is read off the clock, not only a timer: a
 * thread busy drawing the farm can hold the timer back past the moment the farm is ready.
 */
export function useFarmLoading(
  data: boolean,
  drawn: boolean,
): {
  /** Paper lies over the farm: while waiting (it looks like the empty scene) and revealing. */
  readonly covered: boolean;
  readonly revealing: boolean;
  readonly loading: boolean;
  readonly ready: boolean;
  readonly done: () => void;
} {
  const ready = data && drawn;
  const [phase, setPhase] = useState<'wait' | 'reveal' | 'done'>(ready ? 'done' : 'wait');
  const since = useRef(Date.now());
  useEffect(() => {
    if (phase !== 'wait') return;
    if (ready) {
      setPhase(Date.now() - since.current < LOADER_AFTER_MS ? 'done' : 'reveal');
      return;
    }
    const timer = setTimeout(() => setPhase('reveal'), LOADER_AFTER_MS);
    return () => clearTimeout(timer);
  }, [ready, phase]);
  const done = useCallback(() => setPhase('done'), []);
  return {
    covered: phase !== 'done',
    revealing: phase === 'reveal',
    loading: !data && phase === 'reveal',
    ready,
    done,
  };
}
