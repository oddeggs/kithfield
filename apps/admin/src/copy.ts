import type {
  AuditEntry,
  ModerationAction,
  ReportCategory,
  RuleRef,
  Species,
} from '@kithfield/contracts';
import { translator } from '@kithfield/i18n';

/* The desk's copy (English: the safety team works in English) and the labels built from it. */

export const tr = translator('en');

export const speciesLabel = (species: Species | null) =>
  species === null ? tr('moderation.member.critter') : tr(`moderation.species.${species}`);

export const categoryLabel = (category: ReportCategory) => tr(`moderation.category.${category}`);

/** The short label a queue chip uses. */
const SHORT_CHIPS = new Set<ReportCategory>(['under_13', 'self_harm', 'credible_threat']);

export const chipLabel = (category: ReportCategory) =>
  SHORT_CHIPS.has(category)
    ? tr(`moderation.chip.${category as 'under_13' | 'self_harm' | 'credible_threat'}`)
    : categoryLabel(category);

const NAMED_RULES = new Set([3, 4, 6]);

/** `House rule 3 · be kind` (long) or `House rule 3` (short, for tables). */
export function ruleLabel(rule: RuleRef | null, long = true): string {
  if (rule === null) return tr('moderation.rule.none');
  if (typeof rule === 'string') return tr(`moderation.rule.${rule}`);
  if (long && NAMED_RULES.has(rule)) return tr(`moderation.rule.${rule as 3 | 4 | 6}`);
  return tr('moderation.rule.number', { n: rule });
}

/** Every rule a decision can name, in the order the picker lists them. */
export const ALL_RULES: readonly RuleRef[] = [
  ...Array.from({ length: 20 }, (_, i) => i + 1),
  'child_safety',
  'self_harm',
  'credible_threat',
  'legal',
];

export const actionLabel = (what: ModerationAction | AuditEntry['what']) =>
  tr(`moderation.action.${what}`);

const WHAT_KINDS = new Set([
  'message',
  'media',
  'voice',
  'sticker',
  'link',
  'status',
  'critter_changed',
]);

/** What was reported, from its event kind; null means a person. */
export function whatLabel(kind: string | null): string {
  if (kind === null) return tr('moderation.what.member');
  if (WHAT_KINDS.has(kind)) {
    return tr(
      `moderation.what.${kind as 'message' | 'media' | 'voice' | 'sticker' | 'link' | 'status' | 'critter_changed'}`,
    );
  }
  return tr('moderation.what.other');
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Time left until a due time: `38 min`, `11h`, or `late`. */
export function dueText(dueAt: number, now: number): string {
  const left = dueAt - now;
  if (left <= 0) return tr('moderation.due.late');
  if (left < HOUR)
    return tr('moderation.due.minutes', { minutes: Math.max(1, Math.floor(left / MINUTE)) });
  return tr('moderation.due.hours', { hours: Math.floor(left / HOUR) });
}

/** How long ago: `40 min`, `2h`, `3d`. */
export function agoText(at: number, now: number): string {
  const ago = Math.max(0, now - at);
  if (ago < HOUR)
    return tr('moderation.due.minutes', { minutes: Math.max(1, Math.floor(ago / MINUTE)) });
  if (ago < DAY) return tr('moderation.due.hours', { hours: Math.floor(ago / HOUR) });
  return tr('moderation.due.days', { days: Math.floor(ago / DAY) });
}

/** The median time to a first action: `3h 10m`. */
export function medianText(ms: number | null): string {
  if (ms === null) return tr('moderation.audit.none');
  const minutes = Math.round(ms / MINUTE);
  if (minutes < 60) return tr('moderation.audit.medianMinutes', { minutes });
  return tr('moderation.audit.medianValue', {
    hours: Math.floor(minutes / 60),
    minutes: minutes % 60,
  });
}

/** A share as `98.4%` (or `100%`), or `·` when nothing was due. */
export function percentText(met: number, due: number): string {
  if (due === 0) return tr('moderation.audit.none');
  const value = Math.round((met / due) * 1000) / 10;
  return tr('moderation.audit.percent', {
    value: Number.isInteger(value) ? value : value.toFixed(1),
  });
}
