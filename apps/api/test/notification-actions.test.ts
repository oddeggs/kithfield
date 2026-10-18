import {
  actionCommand,
  type EventEnvelope,
  type PlanPushData,
  type PushData,
} from '@kithfield/contracts';
import { describe, expect, it } from 'vitest';

import { checkTargets } from '../src/farm/targets';

/*
 * The writes a lock-screen answer sends are ones the farm takes: a dewdrop sits only on something
 * said in the chat, so a plan or a doorstep push leaves its dewdrop on the farm.
 */

const opId = '01890000-0000-7000-8000-000000000001';
const farm = 'farm-a';

const log: Record<number, EventEnvelope> = {
  13: { seq: 13, kind: 'seed_planted' } as unknown as EventEnvelope,
  17: { seq: 17, kind: 'message' } as unknown as EventEnvelope,
  21: { seq: 21, kind: 'gift' } as unknown as EventEnvelope,
};
const lookup = (seq: number) => log[seq] ?? null;

const accepted = (built: ReturnType<typeof actionCommand>) => {
  if (built === null) throw new Error('No command');
  return checkTargets(built.command, lookup);
};

describe('a lock-screen answer, as the farm checks it', () => {
  it('takes a dewdrop from a plan push', () => {
    const plan: PlanPushData = { farm, seq: 13, kind: 'seed_planted', push: 'p1', seed: 13 };
    expect(accepted(actionCommand('dewdrop', 'plan', plan, opId))).toBeNull();
    expect(accepted(actionCommand('im_in', 'plan', plan, opId))).toBeNull();
  });

  it('takes a dewdrop from a doorstep push', () => {
    const gift: PushData = { farm, seq: 21, kind: 'gift', push: 'p2' };
    expect(actionCommand('dewdrop', 'tend', gift, opId)?.command.payload).toEqual({});
    expect(accepted(actionCommand('dewdrop', 'tend', gift, opId))).toBeNull();
  });

  it('puts a dewdrop from a message push on the message', () => {
    const message: PushData = { farm, seq: 17, kind: 'message', push: 'p3' };
    expect(actionCommand('dewdrop', 'tend', message, opId)?.command.payload).toEqual({
      target: 17,
    });
    expect(accepted(actionCommand('dewdrop', 'tend', message, opId))).toBeNull();
  });
});
