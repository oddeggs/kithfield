/**
 * Writes held for a few seconds before they go, so a second tap can take them back: Quick Tend's
 * answers. Leaving sends whatever is still waiting, at once.
 */
export function createGrace(ms: number) {
  const waiting = new Map<string, { timer: ReturnType<typeof setTimeout>; go: () => void }>();
  const run = (key: string) => {
    const w = waiting.get(key);
    if (!w) return;
    waiting.delete(key);
    w.go();
  };
  return {
    /** Holds `go` under `key`; it runs after `ms` unless taken back first. */
    hold(key: string, go: () => void): void {
      if (waiting.has(key)) return;
      waiting.set(key, { timer: setTimeout(() => run(key), ms), go });
    },
    /** Takes a held write back; answers whether there was one. */
    undo(key: string): boolean {
      const w = waiting.get(key);
      if (!w) return false;
      clearTimeout(w.timer);
      waiting.delete(key);
      return true;
    },
    /** Sends everything still held, now. */
    flush(): void {
      for (const [key, w] of [...waiting]) {
        clearTimeout(w.timer);
        run(key);
      }
    },
  };
}
