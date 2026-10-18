import { FarmKind, type QuickTendList, type QuickTendWhy, VisitPeer } from '@kithfield/contracts';

/*
 * Quick Tend: what waits for the person across their farms and visits,
 * newest first. The app draws the first three as cards (questions, plans, someone back) and folds
 * the rest into the bouquet. Tending a farm (any reply, gesture or sticker there, or opening it)
 * takes what waited there off the list (`chats.applyDelivery`).
 */

/** The list carries at most this many items. */
const QUICK_TEND_CAP = 99;

const PLAN_KINDS = new Set(['seed_planted', 'seed_changed', 'vote', 'rsvp', 'checkin']);
const LEFT_FOR_YOU = new Set([
  'firefly',
  'gift',
  'slow_post',
  'gate',
  'dewdrop',
  'wave',
  'hug',
  'knock',
]);

/**
 * Why something waits: a plan that needs the person, something left on their step, a birthday
 * card, a friend back from hibernating, or words for them (a question when they end in one).
 */
export function whyOf(kind: string, preview: string | null): QuickTendWhy {
  if (PLAN_KINDS.has(kind)) return 'plan';
  if (LEFT_FOR_YOU.has(kind)) return 'doorstep';
  if (kind === 'card_signed') return 'birthday';
  if (kind === 'hibernate') return 'back';
  return preview?.trim().endsWith('?') === true ? 'question' : 'mention';
}

type Row = {
  farm: string;
  seq: number;
  kind: string;
  actor: string | null;
  at: number;
  preview: string | null;
  farm_kind: string;
  name: string | null;
  with_json: string | null;
};

/** Everything waiting on the farms the cottage knows, newest first. */
export function quickTend(sql: SqlStorage): QuickTendList {
  const rows = sql
    .exec<Row>(
      `SELECT d.farm, d.seq, d.kind, d.actor, d.at, d.preview, f.farm_kind, f.name, f.with_json
       FROM doorstep d JOIN farms f ON f.farm = d.farm AND f.farm_kind IS NOT NULL
       ORDER BY d.at DESC, d.seq DESC LIMIT ${QUICK_TEND_CAP}`,
    )
    .toArray();
  return {
    items: rows.map((row) => ({
      farm: row.farm,
      farmKind: FarmKind.parse(row.farm_kind),
      name: row.name,
      with: row.with_json === null ? null : VisitPeer.parse(JSON.parse(row.with_json)),
      seq: row.seq,
      kind: row.kind,
      actor: row.actor,
      at: row.at,
      preview: row.preview,
      why: whyOf(row.kind, row.preview),
    })),
  };
}
