import type { RuleRef } from '@kithfield/contracts';

type NamedRule = 'safety.rule.3' | 'safety.rule.4' | 'safety.rule.6';
type Category = Exclude<RuleRef, number>;

/**
 * How a rule is named to the person it was used on: the house rules the safety team names most
 * in their own words, any other by its number, and the categories by what they protect.
 */
export function ruleKey(
  rule: RuleRef,
):
  | { readonly key: NamedRule | `safety.rule.${Category}`; readonly n: null }
  | { readonly key: null; readonly n: number } {
  if (typeof rule !== 'number') return { key: `safety.rule.${rule}`, n: null };
  if (rule === 3 || rule === 4 || rule === 6) return { key: `safety.rule.${rule}`, n: null };
  return { key: null, n: rule };
}
