import { describe, expect, it } from '@jest/globals';

import { remoteView } from './remote-view';

const reload = () => undefined;

describe('a screen built on fetches', () => {
  it('waits while any fetch has nothing yet', () => {
    expect(remoteView([{ data: null, failed: false, reload }])).toBe('loading');
    expect(
      remoteView([
        { data: {}, failed: false, reload },
        { data: null, failed: false, reload },
      ]),
    ).toBe('loading');
  });

  it('says it failed when a fetch failed with nothing to show', () => {
    expect(
      remoteView([
        { data: {}, failed: false, reload },
        { data: null, failed: true, reload },
      ]),
    ).toBe('failed');
  });

  it('keeps what it had when a later fetch fails', () => {
    expect(remoteView([{ data: { name: 'Pip' }, failed: true, reload }])).toBe('ready');
  });
});
