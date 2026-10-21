import { z } from 'zod';

import { AnyEventKind } from '../events';
import { EpochMs, FarmId, FarmName, Id, PersonId, RuleRef, Seq, text } from '../primitives';

/**
 * What a member can pick when reporting a message or a person, in the order the sheet lists them.
 * `child_safety` is sexual content involving, or the sexual exploitation of, a minor.
 */
export const ReportReason = z.enum([
  'unkind',
  'unwanted_contact',
  'sexual_content',
  'child_safety',
  'violence',
  'self_harm',
  'spam',
  'something_else',
]);
export type ReportReason = z.infer<typeof ReportReason>;

/**
 * `POST /v1/reports`: a message (with up to 20 events around it copied as evidence) or a person
 * from the members list. The reported person is never told who reported.
 */
export const ReportRequest = z.object({
  farm: FarmId,
  about: z.discriminatedUnion('about', [
    z.object({ about: z.literal('event'), seq: Seq }),
    z.object({ about: z.literal('person'), person: PersonId }),
  ]),
  reason: ReportReason,
  note: text(500).optional(),
  alsoBlock: z.boolean(),
});
export type ReportRequest = z.infer<typeof ReportRequest>;

export const ReportResponse = z.object({ report: Id });
export type ReportResponse = z.infer<typeof ReportResponse>;

/** What happened to a member's account after a decision, as they are told it. */
export const AccountOutcome = z.enum(['unchanged', 'warned', 'paused', 'removed_from_farm']);
export type AccountOutcome = z.infer<typeof AccountOutcome>;

/**
 * `GET /v1/me/safety-notes`: the quiet notes from the safety team, shown in the farm, never pushed
 * with content. The reporter hears the outcome for the item, never the sanction; the reported
 * person hears which rule and can ask for another look. The cottage socket's `safety_note` frame
 * says when there is a new one.
 */
export const SafetyNote = z.discriminatedUnion('note', [
  z.object({
    note: z.literal('report_answered'),
    id: Id,
    at: EpochMs,
    report: Id,
    farm: FarmId,
    /** Null for a visit. */
    farmName: FarmName.nullable(),
    about: PersonId.nullable(),
    kind: AnyEventKind.nullable(),
    eventAt: EpochMs.nullable(),
    outcome: z.enum(['removed', 'kept']),
  }),
  z.object({
    note: z.literal('content_removed'),
    id: Id,
    at: EpochMs,
    action: Id,
    farm: FarmId,
    /** Null for a visit. */
    farmName: FarmName.nullable(),
    kind: AnyEventKind.nullable(),
    eventAt: EpochMs.nullable(),
    rule: RuleRef,
    /** Shown blurred until tapped, so it doesn't hurt twice. */
    excerpt: text(300).nullable(),
    account: AccountOutcome,
    pausedUntil: EpochMs.nullable(),
    appealable: z.boolean(),
  }),
  z.object({
    note: z.literal('appeal_answered'),
    id: Id,
    at: EpochMs,
    appeal: Id,
    outcome: z.enum(['kept', 'undone']),
    reply: text(2000),
  }),
]);
export type SafetyNote = z.infer<typeof SafetyNote>;

export const SafetyNoteList = z.object({ notes: z.array(SafetyNote).max(100) });
export type SafetyNoteList = z.infer<typeof SafetyNoteList>;

/** `POST /v1/appeals`: read by a moderator who wasn't part of the first decision, within 7 days. */
export const AppealRequest = z.object({
  action: Id,
  text: text(1000),
});
export type AppealRequest = z.infer<typeof AppealRequest>;

export const AppealResponse = z.object({ appeal: Id });
export type AppealResponse = z.infer<typeof AppealResponse>;
