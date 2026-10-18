import { describe, expect, it } from '@jest/globals';

import { ruleKey } from './rules';

describe('naming the rule a decision used', () => {
  it('names the common house rules in words and the rest by number', () => {
    expect(ruleKey(3)).toEqual({ key: 'safety.rule.3', n: null });
    expect(ruleKey(6)).toEqual({ key: 'safety.rule.6', n: null });
    expect(ruleKey(11)).toEqual({ key: null, n: 11 });
  });

  it('names a category by what it protects', () => {
    expect(ruleKey('child_safety')).toEqual({ key: 'safety.rule.child_safety', n: null });
  });
});
