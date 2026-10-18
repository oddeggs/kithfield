import type { FarmState, PersonId } from '@kithfield/contracts';

/** An event of the farm's log as the phone holds it, read loosely. */
interface HeldEvent {
  readonly seq: number;
  readonly kind: string;
  readonly payload: unknown;
}

export interface RemovalNotice {
  readonly farmName: string;
  /** Who made the change, never by name. */
  readonly by: 'keeper' | 'safety';
  /** One notice per removal: the farm, the removal's seq and the person. */
  readonly key: string;
}

/**
 * The removal notice for `me` on a farm, read from what the phone holds: the farm lists them as
 * a former member who was removed, and the `removed` event says by whom. Null for anything else,
 * so a crafted link shows nothing.
 */
export function removalFor(
  state: FarmState | null,
  me: PersonId,
  events: readonly HeldEvent[],
): RemovalNotice | null {
  if (state === null || state.members.some((m) => m.person === me)) return null;
  const former = state.former.find((f) => f.person === me && f.how === 'removed');
  if (!former) return null;
  const removal = [...events]
    .sort((a, b) => b.seq - a.seq)
    .find((e) => e.kind === 'removed' && (e.payload as { person?: unknown })?.person === me);
  if (!removal) return null;
  const by = (removal.payload as { by?: unknown }).by === 'safety' ? 'safety' : 'keeper';
  return { farmName: state.name ?? '', by, key: `${state.farm}:${removal.seq}:${me}` };
}

const listOf = (stored: string | null): string[] => {
  try {
    const list: unknown = JSON.parse(stored ?? '[]');
    return Array.isArray(list) ? list.filter((k): k is string => typeof k === 'string') : [];
  } catch {
    return [];
  }
};

/** Whether this removal's notice was shown already. */
export const wasShown = (stored: string | null, key: string) => listOf(stored).includes(key);

/** The stored list with this removal added. */
export const shownAfter = (stored: string | null, key: string): string =>
  JSON.stringify([...new Set([...listOf(stored), key])]);
