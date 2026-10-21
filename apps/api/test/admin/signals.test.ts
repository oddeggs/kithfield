import { describe, expect, it } from 'vitest';

import { aimedAt, categorize, excerptOf, suggestedRule } from '../../src/admin/signals';

describe('what the desk reads from a report', () => {
  it('files by the reason, unless the words make it urgent', () => {
    expect(categorize(['unkind'], ['you are so annoying'])).toEqual({
      category: 'harassment',
      urgent: false,
    });
    expect(categorize(['spam'], ['free gift cards'])).toEqual({ category: 'spam', urgent: false });
    expect(categorize(['something_else'], [null])).toEqual({ category: 'other', urgent: false });
    expect(categorize(['something_else'], ['I don’t think I can keep doing this'])).toEqual({
      category: 'self_harm',
      urgent: true,
    });
    expect(categorize(['unkind'], ["I'm going to hurt you after school"])).toEqual({
      category: 'credible_threat',
      urgent: true,
    });
    expect(categorize(['unkind'], ['tao sẽ giết mày'])).toMatchObject({ urgent: true });
    expect(categorize(['something_else'], [null, 'she’s only 11'])).toEqual({
      category: 'under_13',
      urgent: false,
    });
  });

  it('files the serious reasons under their own categories, the gravest ones urgent', () => {
    expect(categorize(['child_safety'], [null])).toEqual({
      category: 'child_safety',
      urgent: true,
    });
    expect(categorize(['violence'], [null])).toEqual({ category: 'credible_threat', urgent: true });
    expect(categorize(['self_harm'], [null])).toEqual({ category: 'self_harm', urgent: true });
    expect(categorize(['sexual_content'], [null])).toEqual({
      category: 'sexual_content',
      urgent: false,
    });
  });

  it('files a case under the most serious of its reasons and words', () => {
    expect(categorize(['spam', 'child_safety', 'unkind'], [null])).toEqual({
      category: 'child_safety',
      urgent: true,
    });
    expect(categorize(['child_safety'], ['I don’t think I can keep doing this'])).toEqual({
      category: 'child_safety',
      urgent: true,
    });
    expect(categorize(['sexual_content'], ['she’s only 11'])).toEqual({
      category: 'child_safety',
      urgent: true,
    });
    expect(categorize(['self_harm', 'violence'], [null])).toEqual({
      category: 'credible_threat',
      urgent: true,
    });
  });

  it('suggests the house rule a category most often touches', () => {
    expect(suggestedRule('harassment')).toBe(3);
    expect(suggestedRule('spam')).toBe(6);
    expect(suggestedRule('self_harm')).toBe('self_harm');
    expect(suggestedRule('child_safety')).toBe('child_safety');
    expect(suggestedRule('other')).toBeNull();
  });

  it('reads the words of an event and who it seems aimed at', () => {
    const base = { opId: 'x', at: 1, day: '2026-10-18', rulesVersion: 2, kind: 'message' as const };
    const june = { ...base, seq: 4, actor: 'june', payload: { text: 'me!!' } };
    const reply = { ...base, seq: 5, actor: 'bram', payload: { text: 'not you', replyTo: 4 } };
    const mention = { ...base, seq: 6, actor: 'bram', payload: { text: 'hey', mentions: ['pip'] } };
    expect(excerptOf(reply)).toBe('not you');
    expect(excerptOf({ payload: { tombstone: 'unsent' } })).toBeNull();
    expect(aimedAt(reply, [june, reply], 'bram')).toBe('june');
    expect(aimedAt(mention, [], 'bram')).toBe('pip');
    expect(aimedAt(june, [], 'june')).toBeNull();
  });
});
