import type { UnsentWrite } from './timeline';

/*
 * Writes the chat draws a moment before they are queued: a sticker sent from the picker flies
 * into its bubble from the tap, so the bubble (and the spot it lands on) is on screen before the
 * outbox has the write. Once the outbox has it, or it lands in the log, the chat follows that row
 * under the same op id, so the bubble never remounts under the flight.
 */

/** A write on its way into the outbox, by the op id it will be queued with. */
export interface OutgoingWrite {
  readonly farm: string;
  readonly opId: string;
  readonly kind: string;
  readonly payload: unknown;
  readonly createdAt: number;
}

/** The writes of `farm` still on their way, as unsent writes; any already queued are left out. */
export function outgoingDrafts(
  outgoing: readonly OutgoingWrite[],
  farm: string,
  pending: ReadonlySet<string>,
): UnsentWrite[] {
  return outgoing
    .filter((w) => w.farm === farm && !pending.has(w.opId))
    .map((w) => ({
      opId: w.opId,
      kind: w.kind,
      payload: w.payload,
      createdAt: w.createdAt,
      acked: false,
    }));
}

/** The writes on their way on this phone, for the chat to draw and the sender to let go of. */
export class OutgoingWrites {
  private writes: readonly OutgoingWrite[] = [];
  private readonly listeners = new Set<() => void>();

  readonly list = (): readonly OutgoingWrite[] => this.writes;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  add(write: OutgoingWrite): void {
    this.writes = [...this.writes.filter((w) => w.opId !== write.opId), write];
    this.changed();
  }

  /** Lets go of a write: it was queued (the outbox draws it now) or refused. */
  drop(opId: string): void {
    if (!this.writes.some((w) => w.opId === opId)) return;
    this.writes = this.writes.filter((w) => w.opId !== opId);
    this.changed();
  }

  private changed() {
    for (const listener of this.listeners) listener();
  }
}

/** The phone's writes on their way. */
export const outgoing = new OutgoingWrites();
