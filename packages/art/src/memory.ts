import type { Art } from './art';

/** The part of React Native's `AppState` this needs (passed in, so the package never imports RN). */
export interface MemoryWarnings {
  addEventListener(type: 'memoryWarning', listener: () => void): { remove(): void };
}

/**
 * Flushes the art's caches on every memory warning. The app's shell calls it once:
 * `const sub = watchMemory(art, AppState)` and `sub.remove()` when the art goes away.
 * Images already handed out stay drawable; the next request redraws what it needs.
 */
export function watchMemory(art: Art, appState: MemoryWarnings): { remove(): void } {
  return appState.addEventListener('memoryWarning', () => art.flush());
}
