import { describe, expect, it } from '@jest/globals';

import { LIMITS } from '@kithfield/contracts';

import { draftFor, extensionOf, keptFiles, limitedText } from './share-intent';

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

  it('keeps a long link that is no web address as words', () => {
    const long = `https://example.com/${'a'.repeat(LIMITS.url)}`;
    expect(draftFor(share(long), 'farm-a', OP, 5, [])).toMatchObject({
      text: long.slice(0, LIMITS.message),
    });
  });

  it('cuts words at the message limit without splitting a character', () => {
    const words = `${'a'.repeat(LIMITS.message - 1)}🌱`;
    expect(limitedText(words)).toBe('a'.repeat(LIMITS.message - 1));
    expect(limitedText('short')).toBe('short');
  });

  it('leaves out empty and oversized files, and keeps no more than a share takes', () => {
    const file = (bytes: number) => ({ uri: 'file:///x', mime: 'image/png', name: 'x', bytes });
    expect(keptFiles([file(0), file(10), file(LIMITS.uploadBytes + 1)])).toEqual([file(10)]);
    expect(keptFiles(Array.from({ length: 12 }, () => file(1)))).toHaveLength(LIMITS.mediaItems);
  });

  it('names an outbox file with a short, plain extension', () => {
    expect(extensionOf('picnic.JPG')).toBe('jpg');
    expect(extensionOf('../../evil.p/n\\g')).toBe('png');
    expect(extensionOf('no-dot')).toBe('bin');
    expect(extensionOf('x.' + 'a'.repeat(200))).toBe('aaaaaaaa');
  });
});
