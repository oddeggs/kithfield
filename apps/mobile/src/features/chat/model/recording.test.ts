import { describe, expect, it } from '@jest/globals';

import { beginRecording } from './recording';

const steps = (log: string[], fail?: string) => ({
  open: () => {
    log.push('open');
    return fail === 'open' ? Promise.reject(new Error('no session')) : Promise.resolve();
  },
  prepare: () => {
    log.push('prepare');
    return fail === 'prepare' ? Promise.reject(new Error('no input')) : Promise.resolve();
  },
  record: () => {
    log.push('record');
  },
  close: () => {
    log.push('close');
    return Promise.resolve();
  },
});

describe('starting a voice note', () => {
  it('opens the mic, prepares and records', async () => {
    const log: string[] = [];
    await expect(beginRecording(steps(log), () => true)).resolves.toBe('recording');
    expect(log).toEqual(['open', 'prepare', 'record']);
  });

  it('settles as failed and gives the mic back when the recorder cannot start', async () => {
    const log: string[] = [];
    await expect(beginRecording(steps(log, 'prepare'), () => true)).resolves.toBe('failed');
    expect(log).toEqual(['open', 'prepare', 'close']);
  });

  it('settles as failed when the audio session cannot open', async () => {
    const log: string[] = [];
    await expect(beginRecording(steps(log, 'open'), () => true)).resolves.toBe('failed');
    expect(log).toEqual(['open', 'close']);
  });

  it('stops before recording when the finger lifted while the mic was opening', async () => {
    const log: string[] = [];
    await expect(beginRecording(steps(log), () => false)).resolves.toBe('dropped');
    expect(log).toEqual(['open', 'close']);
  });
});
