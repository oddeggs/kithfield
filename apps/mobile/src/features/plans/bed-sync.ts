import type { FarmId } from '@kithfield/contracts';

import type { DataClient } from '../../data';

/** How long the seed bed keeps a farm's socket open for it to catch up. */
const SOCKET_WAIT_MS = 10_000;
const TICK_MS = 50;

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Brings each farm the seed bed shows up to date: over HTTP when the phone already holds it, and
 * through the farm's socket (which sends the snapshot) when it holds nothing of it or is too far
 * behind, one farm at a time. Offline it leaves the farms as the phone holds them.
 */
export async function bringUpToDate(
  client: DataClient,
  farms: readonly FarmId[],
  options: { stillWanted: () => boolean; socketWaitMs?: number },
): Promise<void> {
  const viaSocket: FarmId[] = [];
  for (const farm of farms) {
    if (!options.stillWanted()) return;
    try {
      if ((await client.catchUp(farm)) === 'needs_socket') viaSocket.push(farm);
    } catch {
      // No network: what the phone holds is what the seed bed shows.
    }
  }
  for (const farm of viaSocket) {
    if (!options.stillWanted()) return;
    const release = client.hold(farm);
    const deadline = Date.now() + (options.socketWaitMs ?? SOCKET_WAIT_MS);
    try {
      for (;;) {
        const { status } = client.link(farm);
        if (status === 'live' || status === 'blocked' || status === 'offline') break;
        if (Date.now() > deadline || !options.stillWanted()) break;
        await pause(TICK_MS);
      }
    } finally {
      release();
    }
  }
}
