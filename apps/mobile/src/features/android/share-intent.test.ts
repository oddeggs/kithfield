import { describe, expect, it } from '@jest/globals';

import { draftFor } from './share-intent';

const OP = '01900000-0000-7000-8000-000000000001';
const share = (text: string | null, files = 0) => ({
  text,
  subject: null,
  files: Array.from({ length: files }, (_, i) => ({
    uri: `file:///cache/shared/${i}.png`,
    mime: 'image/png',
    name: `${i}.png`,
    bytes: 10,
  })),
});

describe('a share from the Android share sheet', () => {
  it('sends a lone link as a link, and anything else as words', () => {
    expect(draftFor(share('https://example.com/picnic'), 'farm-a', OP, 5, [])).toEqual({
      opId: OP,
      farm: 'farm-a',
      at: 5,
      url: 'https://example.com/picnic',
      files: [],
    });
    expect(draftFor(share('  see you at https://x.y  '), 'farm-a', OP, 5, [])).toMatchObject({
      text: 'see you at https://x.y',
    });
  });

  it('carries photos already in the outbox, and is nothing at all when empty', () => {
    const files = [{ path: `surfaces/share-outbox/${OP}-0.png`, mime: 'image/png', bytes: 10 }];
    expect(draftFor(share(null, 1), 'farm-a', OP, 5, files)?.files).toEqual(files);
    expect(draftFor(share('   '), 'farm-a', OP, 5, [])).toBeNull();
  });
});
