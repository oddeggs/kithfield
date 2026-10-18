import { z } from 'zod';

import { EventKindSchema } from '../events';
import { EpochMs, FarmId, FarmName, Id, PersonId, RuleRef, Seq, text } from '../primitives';

/** What a member can pick when reporting (11-09). */
export const ReportReason = z.enum(['unkind', 'unwanted_contact', 'spam', 'something_else']);
export type ReportReason = z.infer<typeof ReportReason>;

/**
 * `POST /v1/reports`: a message (with up to 20 events around it copied as evidence) or a person
 * (11-06). The reported person is never told who reported.
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

/** What happened to a member's account after a decision, as they are told it (11-22). */
export const AccountOutcome = z.enum(['unchanged', 'warned', 'paused', 'removed_from_farm']);
export type AccountOutcome = z.infer<typeof AccountOutcome>;

/**
 * `GET /v1/me/safety-notes`: the quiet notes from the safety team, shown in the farm, never pushed
 * with content. The reporter hears the outcome for the item, never the sanction (11-21); the
 * reported person hears which rule and can ask for another look (11-22).
 */
export const SafetyNote = z.discriminatedUnion('note', [
  z.object({
    note: z.literal('report_answered'),
    id: Id,
    at: EpochMs,
    report: Id,
    farm: FarmId,
    farmName: FarmName,
    about: PersonId.nullable(),
    kind: EventKindSchema.nullable(),
    eventAt: EpochMs.nullable(),
    outcome: z.enum(['removed', 'kept']),
  }),
  z.object({
    note: z.literal('content_removed'),
    id: Id,
    at: EpochMs,
    action: Id,
    farm: FarmId,
    farmName: FarmName,
    kind: EventKindSchema.nullable(),
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
