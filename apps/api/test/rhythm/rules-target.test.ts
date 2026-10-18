import { FarmEvent } from '@kithfield/contracts';
import { RULES_VERSION } from '@kithfield/farm';
import { runInDurableObject } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';

import type { Bindings } from '../../src/env';
import { createFarm } from '../../src/farm/actions';
import { FarmHost } from '../../src/farm/host';
import { farmPorts, rulesTarget } from '../../src/farm/wiring';
import {
  cast,
  farmStub,
  freshFarmId,
  type Person,
  plantFarm,
  profile,
  useTestPorts,
} from '../farm/support/doubles';

/*
 * An environment can hold farms back from this server's newest rules (`RULES_TARGET`) until the
 * phones out there can read them: farms move to the lower of the two, and new farms start there.
 */

let pip: Person;
beforeEach(async () => {
  useTestPorts();
  ({ pip } = await cast('pip'));
});

/** A host over the object's storage, in an environment with `target` set. */
const hostIn = (state: DurableObjectState, target: string | undefined) => {
  const bindings = { ...env, RULES_TARGET: target } as unknown as Bindings;
  return new FarmHost(state, bindings, farmPorts);
};

describe('the rules a farm moves to', () => {
  it('stay at the target on waking, and move on once the target does', async () => {
    expect(RULES_VERSION).toBe(4);
    useTestPorts({ rulesVersion: 3 });
    const { stub } = await plantFarm(pip);
    useTestPorts();
    const versions = await runInDurableObject(stub, async (_farm, state) => {
      const held = hostIn(state, '3');
      await held.wake();
      const atThree = held.farm.state?.rulesVersion;
      const moved = hostIn(state, '4');
      await moved.wake();
      return [atThree, moved.farm.state?.rulesVersion];
    });
    expect(versions).toEqual([3, 4]);
  });

  it('are the target for a new farm, and every event it writes is stamped so', async () => {
    const farm = freshFarmId();
    const written = await runInDurableObject(farmStub(farm), async (_farm, state) => {
      const host = hostIn(state, '3');
      await createFarm(host, {
        farm,
        kind: 'farm',
        name: 'The Thursday Lot',
        land: 'meadow',
        timeZone: 'Europe/London',
        hemisphere: 'north',
        keeper: pip.id,
        pair: null,
        members: [{ person: pip.id, profile: profile(pip), via: 'created' }],
      });
      const events = host.store.after(0, 10).map((e) => FarmEvent.parse(e));
      return { state: host.farm.state?.rulesVersion, events: events.map((e) => e.rulesVersion) };
    });
    expect(written).toEqual({ state: 3, events: [3, 3] });
  });

  it("are this server's own without a target, and never above them", () => {
    expect(rulesTarget(undefined, 4)).toBe(4);
    expect(rulesTarget('', 4)).toBe(4);
    expect(rulesTarget('three', 4)).toBe(4);
    expect(rulesTarget('3', 4)).toBe(3);
    expect(rulesTarget('9', 4)).toBe(4);
  });
});
