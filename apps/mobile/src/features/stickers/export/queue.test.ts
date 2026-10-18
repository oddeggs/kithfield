import { describe, expect, it } from '@jest/globals';

import { serialQueue } from './queue';

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('one bake at a time', () => {
  it('starts each job only when the one before it has finished', async () => {
    const run = serialQueue();
    const log: string[] = [];
    let release: () => void = () => undefined;
    const first = run(
      () =>
        new Promise<string>((resolve) => {
          log.push('first starts');
          release = () => resolve('first');
        }),
    );
    const second = run(() => {
      log.push('second starts');
      return Promise.resolve('second');
    });
    await tick();
    expect(log).toEqual(['first starts']);
    release();
    expect(await first).toBe('first');
    expect(await second).toBe('second');
    expect(log).toEqual(['first starts', 'second starts']);
  });

  it('goes on after a job fails', async () => {
    const run = serialQueue();
    const failed = run(() => Promise.reject(new Error('no')));
    const next = run(() => Promise.resolve('next'));
    await expect(failed).rejects.toThrow('no');
    expect(await next).toBe('next');
  });
});
