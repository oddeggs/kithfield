import { describe, expect, it } from '@jest/globals';

import { createStartOnce } from './start-once';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

describe('starting the data layer once', () => {
  it('gives every caller the same start, however many mounts ask', async () => {
    let begun = 0;
    const once = createStartOnce(() => Promise.resolve({ runtime: ++begun }));
    const first = once.start();
    const second = once.start();
    expect(second).toBe(first);
    await expect(first).resolves.toEqual({ runtime: 1 });
    // A remount after the start finished still gets the running one.
    await expect(once.start()).resolves.toEqual({ runtime: 1 });
    expect(begun).toBe(1);
  });

  it('tries again after a start that failed', async () => {
    let begun = 0;
    const once = createStartOnce(() => {
      begun += 1;
      return begun === 1 ? Promise.reject(new Error('offline')) : Promise.resolve(begun);
    });
    await expect(once.start()).rejects.toThrow('offline');
    await expect(once.start()).resolves.toBe(2);
    expect(begun).toBe(2);
  });

  it('starts afresh after a reset', async () => {
    let begun = 0;
    const once = createStartOnce(() => Promise.resolve(++begun));
    await once.start();
    once.reset();
    await expect(once.start()).resolves.toBe(2);
  });

  it('keeps a newer start when an older one fails after a reset', async () => {
    const attempts = [deferred<string>(), deferred<string>()];
    let begun = 0;
    const once = createStartOnce(() => attempts[begun++]!.promise);
    const old = once.start();
    once.reset();
    const fresh = once.start();
    attempts[0]!.reject(new Error('late failure'));
    await expect(old).rejects.toThrow('late failure');
    expect(once.start()).toBe(fresh);
    attempts[1]!.resolve('fresh');
    await expect(fresh).resolves.toBe('fresh');
    expect(begun).toBe(2);
  });
});
