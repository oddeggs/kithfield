import { describe, expect, it } from 'vitest';

import type { StringKey } from './catalogue-types';
import { resolveEntry, t, translator } from './translate';

describe('t', () => {
  it('reads a key in the asked language', () => {
    expect(t('en', 'glossary.seedBed')).toBe('Seed bed');
    expect(t('vi', 'glossary.seedBed')).toBe('Luống hạt');
  });

  it('types keys and params from the English catalogue', () => {
    // @ts-expect-error a key no catalogue has
    expect(t('en', 'glossary.nowhere')).toBe('glossary.nowhere');
    // @ts-expect-error a key with no placeholders takes no params
    expect(t('en', 'glossary.farm', { name: 'Pip' })).toBe('Farm');
  });

  it('reads an unknown key (only possible from untyped input) as the key itself', () => {
    expect(t('vi', 'glossary.nothing' as StringKey)).toBe('glossary.nothing');
  });
});

describe('translator', () => {
  it('binds a language', () => {
    const tr = translator('vi');
    expect(tr('glossary.dewdrop')).toBe('Giọt sương');
  });
});

describe('resolveEntry', () => {
  const from = {
    en: { 'x.a': 'Hello {name}', 'x.b': 'Bye', 'x.c': { one: 'one', other: 'many' } },
    vi: { 'x.a': 'Chào {name}', 'x.b': ' ', 'x.c': { other: '' } },
  };

  it('uses the language’s own entry when it has one', () => {
    expect(resolveEntry(from, 'vi', 'x.a')).toEqual({ entry: 'Chào {name}', language: 'vi' });
  });

  it('falls back to English, with English plural rules, when the entry is missing or empty', () => {
    expect(resolveEntry(from, 'vi', 'x.b')).toEqual({ entry: 'Bye', language: 'en' });
    expect(resolveEntry(from, 'vi', 'x.c')).toEqual({
      entry: { one: 'one', other: 'many' },
      language: 'en',
    });
  });

  it('gives null for a key no catalogue has', () => {
    expect(resolveEntry(from, 'vi', 'x.z')).toBeNull();
  });
});
