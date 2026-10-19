/** The part of a fetch a screen decides on: what it holds, whether it failed, and a retry. */
export interface RemoteLike {
  readonly data: unknown;
  readonly failed: boolean;
  readonly reload: () => void;
}

/**
 * How a screen built on fetches stands: `ready` once each holds its details (a later failure
 * keeps the details it had), `failed` when any fetch failed with nothing to show, otherwise
 * `loading`.
 */
export function remoteView(remotes: readonly RemoteLike[]): 'ready' | 'loading' | 'failed' {
  if (remotes.every((r) => r.data !== null)) return 'ready';
  if (remotes.some((r) => r.data === null && r.failed)) return 'failed';
  return 'loading';
}
