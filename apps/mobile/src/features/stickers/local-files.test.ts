import { describe, expect, it, jest } from '@jest/globals';

const deleted: string[] = [];

jest.mock('expo-constants', () => ({ expoConfig: { extra: { appGroup: 'group.test' } } }));
jest.mock('expo-file-system', () => {
  class Entry {
    readonly uri: string;
    readonly name: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/');
      this.name = this.uri.split('/').filter(Boolean).pop() ?? '';
    }
    get exists() {
      return true;
    }
    delete() {
      deleted.push(this.uri);
    }
  }
  class File extends Entry {}
  class Directory extends Entry {
    list() {
      if (this.uri !== 'doc') return [];
      return [
        new File('doc', 'stickers-recent-pip.json'),
        new File('doc', 'stickers-noted-pip'),
        new File('doc', 'planted-seeds.json'),
      ];
    }
  }
  return {
    File,
    Directory,
    Paths: {
      document: new Directory('doc'),
      cache: new Directory('cache'),
      appleSharedContainers: { 'group.test': new Directory('group') },
    },
  };
});

import { clearStickersForSignOut, personFile } from './local-files';

describe('the sticker files on this phone', () => {
  it('names each person’s files apart', () => {
    expect(personFile('recent', 'pip').uri).not.toBe(personFile('recent', 'bea').uri);
    expect(personFile('recent', 'pip').name).toBe('stickers-recent-pip.json');
  });

  it('clears every sticker file at sign-out and nothing else', () => {
    clearStickersForSignOut();
    expect(deleted).toEqual(
      expect.arrayContaining([
        'doc/stickers-recent-pip.json',
        'doc/stickers-noted-pip',
        'cache/stickers-whatsapp',
        'cache/stickers-photos',
        'group/surfaces/stickers/',
        'group/surfaces/stickers-next/',
      ]),
    );
    expect(deleted).not.toContain('doc/planted-seeds.json');
  });
});
