import * as admin from './http/admin';
import * as errors from './http/errors';
import * as safety from './http/safety';
import { at, bea, eventPayloads, farm, opId, pip } from './samples.test-data';
import { describeSchemas } from './schema-runner.test-data';

const event = { seq: 41, opId, at, actor: bea, rulesVersion: 1, kind: 'message' };
const queueRow = {
  report: 'R-20418',
  receivedAt: at,
  dueAt: at + 86_400_000,
  category: 'harassment',
  urgent: false,
  kind: 'message',
  farm,
  farmName: 'The Thursday Lot',
  reporters: 2,
  source: 'member',
  claimedBy: null,
};

const samples: Record<string, [valid: unknown[], invalid: unknown[]]> = {
  ReportReason: [['unkind', 'something_else'], ['rude']],
  ReportRequest: [
    [
      {
        farm,
        about: { about: 'event', seq: 41 },
        reason: 'unkind',
        note: 'third time this week',
        alsoBlock: true,
      },
      {
        farm,
        about: { about: 'person', person: pip },
        reason: 'unwanted_contact',
        alsoBlock: false,
      },
    ],
    [{ farm, about: { about: 'event' }, reason: 'unkind', alsoBlock: false }],
  ],
  ReportResponse: [[{ report: 'R-20418' }], [{}]],
  AccountOutcome: [['unchanged', 'paused'], ['banned']],
  SafetyNote: [
    [
      {
        note: 'report_answered',
        id: 'n1',
        at,
        report: 'R-20418',
        farm,
        farmName: 'The Thursday Lot',
        about: pip,
        kind: 'message',
        eventAt: at,
        outcome: 'removed',
      },
      {
        note: 'content_removed',
        id: 'n2',
        at,
        action: 'a1',
        farm,
        farmName: 'The Thursday Lot',
        kind: 'message',
        eventAt: at,
        rule: 3,
        excerpt: 'honestly nobody here',
        account: 'unchanged',
        pausedUntil: null,
        appealable: true,
      },
      {
        note: 'appeal_answered',
        id: 'n3',
        at,
        appeal: 'ap1',
        outcome: 'kept',
        reply: 'We looked again.',
      },
    ],
    [{ note: 'content_removed', id: 'n2', at, action: 'a1', rule: 99 }],
  ],
  SafetyNoteList: [[{ notes: [] }], [{ notes: [{ note: 'hello' }] }]],
  AppealRequest: [[{ action: 'a1', text: 'I was joking.' }], [{ action: 'a1', text: '' }]],
  AppealResponse: [[{ appeal: 'ap1' }], [{ appeal: 7 }]],
  ModeratorRole: [['senior'], ['admin']],
  ReportCategory: [['under_13', 'self_harm'], ['rudeness']],
  ReportStatus: [['claimed'], ['lost']],
  QueueQuery: [[{}, { category: 'hate', cursor: 'c1' }], [{ category: 'all' }]],
  QueueRow: [
    [queueRow, { ...queueRow, farmName: null, kind: 'lantern_lit' }],
    [{ ...queueRow, reporters: -1 }],
  ],
  QueuePage: [[{ rows: [queueRow], cursor: null }], [{ rows: [queueRow] }]],
  ReportDetail: [
    [
      {
        report: 'R-20418',
        status: 'claimed',
        category: 'harassment',
        urgent: false,
        receivedAt: at,
        dueAt: at,
        farm,
        farmName: 'The Thursday Lot',
        reported: { person: 'p_bram', name: 'Bram' },
        reportedSeq: 41,
        reasons: ['unkind', 'unkind'],
        notes: ['third time this week'],
        context: [
          { ...event, payload: eventPayloads.message },
          { ...event, seq: 42, kind: 'lantern_lit', payload: {} },
        ],
        signals: {
          earlierReports: 1,
          accountAgeDays: 210,
          aimedAt: bea,
          blockedBy: 0,
          suggestedRule: 3,
        },
      },
    ],
    [{ report: 'R-1', context: Array(22).fill({ ...event, payload: eventPayloads.message }) }],
  ],
  ModerationAction: [
    ['remove_warn', 'remove_from_kithfield', 'freeze_farm', 'unfreeze_farm'],
    ['shadowban'],
  ],
  ActionRequest: [
    [
      {
        action: 'remove_warn',
        rule: 3,
        note: 'Repeated put-downs',
        tellReporters: true,
        tellMember: true,
      },
      {
        action: 'dismiss',
        rule: null,
        note: 'Joke between friends',
        tellReporters: true,
        tellMember: false,
      },
      {
        action: 'unfreeze_farm',
        rule: null,
        note: 'Keepers back in charge',
        tellReporters: false,
        tellMember: false,
      },
      {
        action: 'freeze_farm',
        rule: 6,
        note: 'Scam links from a taken-over account',
        tellReporters: true,
        tellMember: false,
      },
      {
        action: 'escalate_urgent',
        rule: 'self_harm',
        note: 'Resources sent',
        tellReporters: false,
        tellMember: false,
      },
    ],
    [
      { action: 'remove', rule: null, note: 'gone', tellReporters: true, tellMember: true },
      { action: 'freeze_farm', rule: null, note: 'raid', tellReporters: true, tellMember: false },
    ],
  ],
  ActionResponse: [
    [{ action: 'a1', status: 'awaiting_second' }],
    [{ action: 'a1', status: 'done' }],
  ],
  AppealStatus: [['undone'], ['closed']],
  AppealRow: [
    [
      {
        appeal: 'ap1',
        person: 'p_bram',
        name: 'Bram',
        action: 'a1',
        decision: 'remove_warn',
        category: 'harassment',
        report: 'R-20418',
        sentAt: at,
        status: 'open',
        reviewer: 'm_kofi',
        text: 'I was joking.',
      },
    ],
    [{ appeal: 'ap1', status: 'open' }],
  ],
  AppealDecision: [
    [{ outcome: 'keep', reply: 'It stays down.' }],
    [{ outcome: 'maybe', reply: 'x' }],
  ],
  MemberRecord: [
    [
      {
        person: 'p_bram',
        name: 'Bram',
        species: 'badger',
        joinedAt: at,
        farms: [{ farm, name: 'The Thursday Lot' }],
        warnings: 1,
        pausedUntil: null,
        history: [
          { at, what: 'actioned', report: 'R-20418', action: 'remove_warn', rule: 3, by: 'm_ana' },
        ],
        blockedBy: 0,
        reportsMade: 0,
        openAppeals: 1,
      },
    ],
    [{ person: 'p_bram', warnings: -1 }],
  ],
  AuditEntry: [
    [
      {
        id: 'l1',
        at,
        by: 'm_kofi',
        what: 'appeal_kept',
        item: 'R-20418',
        rule: 3,
        reason: 'Apology noted',
      },
      {
        id: 'l2',
        at,
        by: null,
        what: 'upload_blocked',
        item: 'H-1192',
        rule: 'child_safety',
        reason: null,
      },
    ],
    [{ id: 'l1', at, by: 'm_kofi', what: 'edited', item: 'R-1', rule: null, reason: null }],
  ],
  ErrorCode: [['under_age', 'farm_full'], ['oops']],
  ErrorBody: [
    [
      { error: { code: 'not_found' } },
      { error: { code: 'bad_request', message: 'name too long', fields: ['name'] } },
    ],
    [{ error: 'not_found' }, { code: 'not_found' }],
  ],
};

describeSchemas(
  'HTTP bodies for safety, moderation and errors',
  { ...safety, ...admin, ...errors },
  samples,
);
