import { z } from 'zod';

import { AnyEventKind, EventEnvelope } from '../events';
import {
  DisplayName,
  EpochMs,
  FarmId,
  FarmName,
  Id,
  LIMITS,
  PersonId,
  RuleRef,
  Seq,
  Species,
  text,
} from '../primitives';
import { ReportReason } from './safety';

/*
 * The moderation console's API (`/admin/v1/*`, behind Cloudflare Access). Every look and every
 * decision is written to the audit log.
 */

export const ModeratorRole = z.enum(['moderator', 'senior', 'legal']);
export type ModeratorRole = z.infer<typeof ModeratorRole>;

/** Queue categories. Urgent ones carry a 1-hour target, the rest 24 hours. */
export const ReportCategory = z.enum([
  'harassment',
  'spam',
  'sexual_content',
  'hate',
  'impersonation',
  'under_13',
  'self_harm',
  'child_safety',
  'credible_threat',
  'other',
]);
export type ReportCategory = z.infer<typeof ReportCategory>;

export const ReportStatus = z.enum(['open', 'claimed', 'actioned', 'dismissed', 'escalated']);
export type ReportStatus = z.infer<typeof ReportStatus>;

/** `GET /admin/v1/queue?category=&cursor=`: urgent first, then oldest first. */
export const QueueQuery = z.object({
  category: ReportCategory.optional(),
  cursor: z.string().max(256).optional(),
});
export type QueueQuery = z.infer<typeof QueueQuery>;

export const QueueRow = z.object({
  report: Id,
  receivedAt: EpochMs,
  dueAt: EpochMs,
  category: ReportCategory,
  urgent: z.boolean(),
  /** What was reported; null for a report about a person, or an automatic flag. */
  kind: AnyEventKind.nullable(),
  farm: FarmId,
  /** Null for a visit. */
  farmName: FarmName.nullable(),
  reporters: z.int().min(0).max(LIMITS.members),
  source: z.enum(['member', 'link_reputation', 'hash_match']),
  claimedBy: Id.nullable(),
});
export type QueueRow = z.infer<typeof QueueRow>;

export const QueuePage = z.object({
  rows: z.array(QueueRow).max(200),
  cursor: z.string().max(256).nullable(),
});
export type QueuePage = z.infer<typeof QueuePage>;

/** `GET /admin/v1/reports/:id` claims the report and logs the look. */
export const ReportDetail = z.object({
  report: Id,
  status: ReportStatus,
  category: ReportCategory,
  urgent: z.boolean(),
  receivedAt: EpochMs,
  dueAt: EpochMs,
  farm: FarmId,
  /** Null for a visit. */
  farmName: FarmName.nullable(),
  reported: z.object({ person: PersonId, name: DisplayName.nullable() }),
  reportedSeq: Seq.nullable(),
  reasons: z.array(ReportReason).max(LIMITS.members),
  notes: z.array(text(500)).max(LIMITS.members),
  /** The reported event and those around it, copied when the report was made. */
  context: z.array(EventEnvelope).max(LIMITS.reportContext),
  signals: z.object({
    earlierReports: z.int().min(0),
    accountAgeDays: z.int().min(0),
    aimedAt: PersonId.nullable(),
    blockedBy: z.int().min(0),
    suggestedRule: RuleRef.nullable(),
  }),
});
export type ReportDetail = z.infer<typeof ReportDetail>;

/**
 * The decisions a moderator can make. Removal from Kithfield needs a second moderator. Pausing
 * writes `settings_changed {setting: 'paused'}` on the person's farms; freezing writes
 * `settings_changed {setting: 'frozen'}`.
 */
export const ModerationAction = z.enum([
  'dismiss',
  'remove',
  'remove_warn',
  'pause_7d',
  'remove_from_farm',
  'remove_from_kithfield',
  'escalate_urgent',
  'escalate_legal',
  'freeze_farm',
  'unfreeze_farm',
]);
export type ModerationAction = z.infer<typeof ModerationAction>;

const ruleFree = new Set<ModerationAction>([
  'dismiss',
  'escalate_urgent',
  'escalate_legal',
  'unfreeze_farm',
]);

/** `POST /admin/v1/reports/:id/actions`. Every action but a dismissal, an escalation or an unfreeze names a rule. */
export const ActionRequest = z
  .object({
    action: ModerationAction,
    rule: RuleRef.nullable(),
    note: text(1000),
    tellReporters: z.boolean(),
    tellMember: z.boolean(),
  })
  .refine((a) => a.rule !== null || ruleFree.has(a.action), {
    message: 'This action needs a rule',
    path: ['rule'],
  });
export type ActionRequest = z.infer<typeof ActionRequest>;

export const ActionResponse = z.object({
  action: Id,
  status: z.enum(['applied', 'awaiting_second']),
});
export type ActionResponse = z.infer<typeof ActionResponse>;

/** `POST /admin/v1/actions/:id/approve` (the second moderator) takes no body. */

export const AppealStatus = z.enum(['open', 'kept', 'undone']);
export type AppealStatus = z.infer<typeof AppealStatus>;

/** `GET /admin/v1/appeals`. */
export const AppealRow = z.object({
  appeal: Id,
  person: PersonId,
  name: DisplayName.nullable(),
  action: Id,
  decision: ModerationAction,
  category: ReportCategory,
  report: Id,
  sentAt: EpochMs,
  status: AppealStatus,
  reviewer: Id.nullable(),
  text: text(1000),
});
export type AppealRow = z.infer<typeof AppealRow>;

/**
 * `POST /admin/v1/appeals/:id/decision`: only by someone who didn't touch the report. Undoing a
 * removal writes `restored` on the farm.
 */
export const AppealDecision = z.object({
  outcome: z.enum(['keep', 'undo']),
  reply: text(2000),
});
export type AppealDecision = z.infer<typeof AppealDecision>;

/** `GET /admin/v1/members/:id`: safety history only, never other chats. */
export const MemberRecord = z.object({
  person: PersonId,
  name: DisplayName.nullable(),
  species: Species.nullable(),
  joinedAt: EpochMs,
  farms: z.array(z.object({ farm: FarmId, name: FarmName.nullable() })).max(500),
  warnings: z.int().min(0),
  pausedUntil: EpochMs.nullable(),
  history: z
    .array(
      z.object({
        at: EpochMs,
        what: z.enum(['joined', 'reported', 'actioned', 'dismissed', 'appealed']),
        report: Id.nullable(),
        action: ModerationAction.nullable(),
        rule: RuleRef.nullable(),
        by: Id.nullable(),
      }),
    )
    .max(500),
  blockedBy: z.int().min(0),
  reportsMade: z.int().min(0),
  openAppeals: z.int().min(0),
});
export type MemberRecord = z.infer<typeof MemberRecord>;

/** One append-only audit log row. `by` is null for the system (hash matches). */
export const AuditEntry = z.object({
  id: Id,
  at: EpochMs,
  by: Id.nullable(),
  what: z.union([
    ModerationAction,
    z.enum(['opened_context', 'claimed', 'appeal_kept', 'appeal_undone', 'upload_blocked']),
  ]),
  item: Id,
  rule: RuleRef.nullable(),
  reason: text(1000).nullable(),
});
export type AuditEntry = z.infer<typeof AuditEntry>;
