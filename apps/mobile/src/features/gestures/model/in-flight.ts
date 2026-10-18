/**
 * Writes on their way to the outbox, by what they are about: a second tap while the first is
 * still being queued is dropped, so one tap's care is never written twice.
 */
export function createInFlight() {
  const going = new Set<string>();
  return {
    /** Runs `write` unless one with the same key is still going; answers false when dropped. */
    async once(key: string, write: () => Promise<boolean>): Promise<boolean> {
      if (going.has(key)) return false;
      going.add(key);
      try {
        return await write();
      } finally {
        going.delete(key);
      }
    },
  };
}

const field = (payload: unknown, key: string): unknown =>
  typeof payload === 'object' && payload !== null && key in payload
    ? (payload as Record<string, unknown>)[key]
    : undefined;

/**
 * What a write is about, for the guard: its farm, kind and the message, person or plan it points
 * at (a dewdrop on seq 7, a hug for Fig, a knock on Pip's window, an edit of seq 12).
 */
export function inFlightKey(farm: string, kind: string, payload: unknown): string {
  const about = field(payload, 'target') ?? field(payload, 'to') ?? field(payload, 'seed') ?? '';
  return `${farm}:${kind}:${JSON.stringify(about)}`;
}
