/** How long a chat shows its whole farm on the way in before folding it to the strip. */
export const HEADER_FOLD_MS = 3000;

/** When a chat's header folds its farm away, and when it shows it again. */
export interface FoldClock {
  /** Whether the whole farm shows. */
  readonly open: () => boolean;
  /** Someone used the chat (scrolled, typed, sent, pressed a message): fold now. */
  readonly interact: () => void;
  /** The header was tapped: show the farm again (folding after a while), or fold it. */
  readonly toggle: () => void;
  /** While a screen reader runs, the farm waits for the person instead of the clock. */
  readonly hold: (on: boolean) => void;
  readonly dispose: () => void;
}

/**
 * The header's fold over time: open on the way in, folded after `delayMs` or at the first use of
 * the chat, whichever is sooner. A tap shows it again, and it folds again the same way. Nothing
 * is kept: a chat opened again starts open.
 */
export function foldClock(
  onChange: (open: boolean) => void,
  delayMs: number = HEADER_FOLD_MS,
): FoldClock {
  let open = true;
  let held = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const stop = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const set = (next: boolean) => {
    stop();
    if (next && !held) timer = setTimeout(() => set(false), delayMs);
    if (next === open) return;
    open = next;
    onChange(next);
  };
  timer = setTimeout(() => set(false), delayMs);
  return {
    open: () => open,
    interact: () => {
      if (open) set(false);
    },
    toggle: () => set(!open),
    hold: (on) => {
      if (on === held) return;
      held = on;
      stop();
      if (open && !held) timer = setTimeout(() => set(false), delayMs);
    },
    dispose: stop,
  };
}
