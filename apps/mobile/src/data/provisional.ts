import { FarmCommand, FarmEvent, type FarmState, type PersonId } from '@kithfield/contracts';

import type { FarmRules } from './farm-rules';
import type { OutboxEntry } from './sync-store';

/** What the farm adds to a command's payload when it writes the event, where the phone knows it. */
function eventPayloadOf(cmd: FarmCommand): unknown {
  if (cmd.kind === 'unsend') return { ...cmd.payload, by: 'author' };
  if (cmd.kind === 'removed') return { ...cmd.payload, by: 'keeper' };
  if (cmd.kind === 'left') return { how: 'left' };
  return cmd.payload;
}

export interface ProvisionalPlace {
  readonly actor: PersonId;
  /** Where it would land: just after everything the phone holds and earlier pending writes. */
  readonly seq: number;
  /** When the write was made on this phone; the farm's own time replaces it. */
  readonly at: number;
  readonly rulesVersion: number;
}

/**
 * The event a write will most likely become, for drawing it at once. Null when only the farm can
 * fill it in (a slow post's delivery time), so it shows once the farm has written it.
 */
export function provisionalEvent(cmd: FarmCommand, place: ProvisionalPlace): FarmEvent | null {
  const parsed = FarmEvent.safeParse({
    seq: place.seq,
    opId: cmd.opId,
    at: place.at,
    rulesVersion: place.rulesVersion,
    actor: place.actor,
    kind: cmd.kind,
    payload: eventPayloadOf(cmd),
  });
  return parsed.success ? parsed.data : null;
}

/**
 * The confirmed farm with every pending write drawn on top, in the order they were made, each as
 * the event it will most likely become.
 */
export function drawPending(
  rules: FarmRules<unknown>,
  confirmed: FarmState | null,
  lastSeq: number,
  pending: readonly OutboxEntry[],
): FarmState | null {
  let state = confirmed;
  let seq = lastSeq;
  for (const entry of pending) {
    if (state === null) break;
    const cmd = FarmCommand.safeParse({
      opId: entry.opId,
      kind: entry.kind,
      payload: entry.payload,
    });
    if (!cmd.success) continue;
    seq += 1;
    const event = provisionalEvent(cmd.data, {
      actor: entry.actor,
      seq,
      at: entry.createdAt,
      rulesVersion: state.rulesVersion,
    });
    if (!event) continue;
    try {
      state = rules.applyEvent(state, event);
    } catch {
      // A write the reducer can't draw yet still goes out; it shows once the farm writes it.
    }
  }
  return state;
}
