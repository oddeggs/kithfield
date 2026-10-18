import type { EventEnvelope, ReportCategory, ReportReason, RuleRef } from '@kithfield/contracts';

/*
 * What the desk reads from a report before anyone opens it: its category, whether it is urgent,
 * the rule it most likely touches, who it seems aimed at and a short excerpt. Urgent reports
 * (child safety, credible threats, self-harm) go to the top of the queue with a 1-hour target;
 * the rest are due within 24 hours.
 */

export const URGENT_CATEGORIES: ReadonlySet<ReportCategory> = new Set([
  'child_safety',
  'credible_threat',
  'self_harm',
]);

export const URGENT_DUE_MS = 60 * 60_000;
export const STANDARD_DUE_MS = 24 * 60 * 60_000;

export const dueAfter = (urgent: boolean) => (urgent ? URGENT_DUE_MS : STANDARD_DUE_MS);

const fromReason: Record<ReportReason, ReportCategory> = {
  unkind: 'harassment',
  unwanted_contact: 'harassment',
  spam: 'spam',
  something_else: 'other',
};

/** Words that lift a report out of its reason, most serious first. English and Vietnamese. */
const textSignals: readonly [ReportCategory, RegExp][] = [
  [
    'child_safety',
    /\b(nudes?|naked|sexual|explicit)\b[\s\S]{0,60}\b(kids?|child(ren)?|minors?|\d{1,2} ?(yo|years? old))\b|\b(kids?|child(ren)?|minors?)\b[\s\S]{0,60}\b(nudes?|naked|sexual|explicit)\b|ảnh nóng[\s\S]{0,40}(trẻ em|bé)/iu,
  ],
  [
    'credible_threat',
    /\b(i(['’]| a)?m going to|i(['’]| wi)ll|gonna|going to)\s+(kill|hurt|stab|shoot|beat up|find)\s+(you|u|him|her|them|everyone)\b|\b(bomb|shoot up)\b|(tao|tôi) sẽ (giết|đánh)/iu,
  ],
  [
    'self_harm',
    /\b(kill myself|end it all|want to die|wanna die|don['’]?t want to (live|be here)|hurt myself|suicid\w*|self[- ]harm|can['’]?t (keep doing this|go on)|don['’]?t think i can keep (doing this|going))\b|muốn chết|tự tử|tự làm hại/iu,
  ],
  [
    'under_13',
    /\bunder ?13\b|\b(she|he|they)(['’]?s| is| are) (only )?([4-9]|1[0-2])\b|\b([4-9]|1[0-2]) ?(yo|years? old)\b|\b(year|grade) [1-7]\b|dưới 13 tuổi/iu,
  ],
];

/** The category a report files under, from its reasons and the words it carries. */
export function categorize(
  reasons: readonly ReportReason[],
  texts: readonly (string | null)[],
): { category: ReportCategory; urgent: boolean } {
  const joined = texts.filter((t): t is string => t !== null).join('\n');
  for (const [category, pattern] of textSignals) {
    if (pattern.test(joined)) return { category, urgent: URGENT_CATEGORIES.has(category) };
  }
  const first = reasons[0] ?? 'something_else';
  return { category: fromReason[first], urgent: false };
}

const suggested: Partial<Record<ReportCategory, RuleRef>> = {
  harassment: 3,
  hate: 4,
  spam: 6,
  child_safety: 'child_safety',
  credible_threat: 'credible_threat',
  self_harm: 'self_harm',
};

/** The house rule a category most often touches, as a starting point for the moderator. */
export const suggestedRule = (category: ReportCategory): RuleRef | null =>
  suggested[category] ?? null;

const asRecord = (payload: unknown): Record<string, unknown> =>
  typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>) : {};

const EXCERPT_MAX = 300;

/** The words of an event, if it has any: a message, an edit, a caption or a link. */
export function excerptOf(event: Pick<EventEnvelope, 'payload'> | null): string | null {
  if (event === null) return null;
  const payload = asRecord(event.payload);
  if ('tombstone' in payload) return null;
  for (const key of ['text', 'caption', 'url', 'words', 'title']) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim() !== '') return value.slice(0, EXCERPT_MAX);
  }
  return null;
}

/** Who a reported event seems aimed at: one person mentioned, or the author it replies to. */
export function aimedAt(
  event: EventEnvelope | null,
  context: readonly EventEnvelope[],
  reported: string,
): string | null {
  if (event === null) return null;
  const payload = asRecord(event.payload);
  const mentions = payload['mentions'];
  if (Array.isArray(mentions) && mentions.length === 1 && typeof mentions[0] === 'string') {
    return mentions[0] === reported ? null : mentions[0];
  }
  const replyTo = payload['replyTo'];
  if (typeof replyTo === 'number') {
    const actor = context.find((e) => e.seq === replyTo)?.actor ?? null;
    return actor === reported ? null : actor;
  }
  const to = payload['to'];
  return typeof to === 'string' && to !== reported ? to : null;
}
