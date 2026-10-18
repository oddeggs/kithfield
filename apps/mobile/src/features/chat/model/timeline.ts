import {
  isTombstone,
  type FarmState,
  type LinkPayload,
  type MediaPayload,
  type PersonId,
  type StickerPayload,
  type VoicePayload,
} from '@kithfield/contracts';

import { keptId } from './people';

/*
 * The chat as the screen draws it, folded from the farm's cached log, this phone's unsent writes
 * and the writes the farm refused: edits applied, unsends left as a quiet gap, dewdrops and
 * reactions gathered under their message, and a divider for each farm day.
 */

/** What the timeline reads of a cached event (the data layer's `StoredEvent`). */
export interface LogEvent {
  readonly seq: number;
  readonly opId: string;
  readonly at: number;
  readonly day?: string | undefined;
  readonly actor: string | null;
  readonly kind: string;
  readonly payload: unknown;
  readonly known: boolean;
}

/** A write this phone made that the farm hasn't shown back yet (the data layer's `PendingWrite`). */
export interface UnsentWrite {
  readonly opId: string;
  readonly kind: string;
  readonly payload: unknown;
  readonly createdAt: number;
  readonly acked: boolean;
}

/** A write the farm refused (the data layer's `StoredRejection`). */
export interface RefusedWrite {
  readonly opId: string;
  readonly farm: string;
  readonly kind: string;
  readonly payload: unknown;
  readonly reason: string;
  readonly at: number;
}

/** Kinds drawn as bubbles. */
export const BUBBLE_KINDS = ['message', 'quiet_note', 'media', 'voice', 'link', 'sticker'] as const;
export type BubbleKind = (typeof BUBBLE_KINDS)[number];
const bubbleKinds = new Set<string>(BUBBLE_KINDS);
export const isBubbleKind = (kind: string): kind is BubbleKind => bubbleKinds.has(kind);

export type Delivery = 'sending' | 'sent' | 'failed';

export interface Reacted {
  readonly reaction: string;
  readonly people: readonly PersonId[];
}

export type BubbleBody =
  | { readonly kind: 'message' | 'quiet_note'; readonly text: string }
  | { readonly kind: 'media'; readonly media: MediaPayload }
  | { readonly kind: 'voice'; readonly voice: VoicePayload }
  | { readonly kind: 'link'; readonly link: LinkPayload }
  | { readonly kind: 'sticker'; readonly sticker: StickerPayload };

export interface BubbleItem {
  readonly type: 'bubble';
  /** Stable across sending and landing: the write's op id. */
  readonly key: string;
  readonly seq: number | null;
  readonly opId: string;
  readonly actor: PersonId | null;
  readonly at: number;
  readonly mine: boolean;
  readonly body: BubbleBody;
  readonly edited: boolean;
  readonly replyTo: number | null;
  readonly mentions: readonly PersonId[];
  /** Only for this person's own bubbles. */
  readonly delivery: Delivery | null;
  /** Why the farm refused it, when it failed. */
  readonly refused: string | null;
  /** Who left a dewdrop on it, oldest first. */
  readonly dew: readonly PersonId[];
  /** This person's own dewdrop on it, to take back: the dewdrop's seq. */
  readonly myDew: number | null;
  readonly reactions: readonly Reacted[];
  readonly pinned: boolean;
}

export type LineKind =
  'firefly' | 'wave' | 'hug' | 'knock' | 'dewdrop' | 'joined' | 'left' | 'plan' | 'slow_post';

export type TimelineItem =
  | BubbleItem
  | { readonly type: 'day'; readonly key: string; readonly at: number; readonly day: string }
  | {
      readonly type: 'unsent';
      readonly key: string;
      readonly seq: number;
      readonly actor: PersonId | null;
      readonly by: 'author' | 'safety';
    }
  | {
      readonly type: 'line';
      readonly key: string;
      readonly seq: number | null;
      readonly kind: LineKind;
      readonly actor: PersonId | null;
      readonly to: PersonId | null;
      readonly title: string | null;
      /** Friends who moved in alongside the first one, drawn as one line. */
      readonly with?: readonly PersonId[];
    }
  | { readonly type: 'back'; readonly key: string; readonly seq: number; readonly actor: PersonId };

/** A critter back after this long away gets a "back from a long nap" card. */
export const LONG_NAP_MS = 4 * 24 * 60 * 60 * 1000;

const obj = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
const num = (value: unknown): number | null => (typeof value === 'number' ? value : null);
const str = (value: unknown): string | null => (typeof value === 'string' ? value : null);

function bodyOf(kind: BubbleKind, payload: unknown): BubbleBody | null {
  const p = obj(payload);
  switch (kind) {
    case 'message':
    case 'quiet_note': {
      const text = str(p['text']);
      return text === null ? null : { kind, text };
    }
    case 'media':
      return Array.isArray(p['items']) ? { kind, media: payload as MediaPayload } : null;
    case 'voice':
      return typeof p['audio'] === 'object' ? { kind, voice: payload as VoicePayload } : null;
    case 'link':
      return typeof p['url'] === 'string' ? { kind, link: payload as LinkPayload } : null;
    case 'sticker':
      return typeof p['sticker'] === 'string' ? { kind, sticker: payload as StickerPayload } : null;
  }
}

/** The local day (`YYYY-MM-DD`) an instant falls on, for writes the farm hasn't stamped. */
export function localDayOf(at: number, timeZone: string | null): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      ...(timeZone ? { timeZone } : {}),
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(at);
    const part = (type: string) => parts.find((x) => x.type === type)?.value ?? '';
    return `${part('year')}-${part('month')}-${part('day')}`;
  } catch {
    return new Date(at).toISOString().slice(0, 10);
  }
}

export interface TimelineInput {
  readonly events: readonly LogEvent[];
  readonly unsent: readonly UnsentWrite[];
  readonly refused: readonly RefusedWrite[];
  readonly me: PersonId | null;
  readonly state: FarmState | null;
  readonly now: number;
}

interface Draft {
  seq: number | null;
  opId: string;
  actor: PersonId | null;
  at: number;
  day: string;
  kind: string;
  payload: unknown;
  delivery: Delivery | null;
  refused: string | null;
}

/** Folds the log, the outbox and the refused writes into what the chat shows, oldest first. */
export function buildTimeline(input: TimelineInput): TimelineItem[] {
  const { state, me, now } = input;
  const zone = state?.timeZone ?? null;
  const who = (actor: string | null) => (actor === null ? null : keptId(state, actor));
  const landed = new Set(input.events.map((e) => e.opId));
  const logged: Draft[] = input.events
    .filter((e) => e.known)
    .map((e) => ({
      seq: e.seq,
      opId: e.opId,
      actor: who(e.actor),
      at: e.at,
      day: e.day ?? localDayOf(e.at, zone),
      kind: e.kind,
      payload: e.payload,
      delivery: who(e.actor) === me && me !== null ? 'sent' : null,
      refused: null,
    }));
  const local: Draft[] = [];
  for (const w of input.unsent) {
    if (landed.has(w.opId)) continue;
    local.push({
      seq: null,
      opId: w.opId,
      actor: me,
      at: w.createdAt,
      day: localDayOf(w.createdAt, zone),
      kind: w.kind,
      payload: w.payload,
      delivery: w.acked ? 'sent' : 'sending',
      refused: null,
    });
  }
  for (const r of input.refused) {
    if (landed.has(r.opId) || !isBubbleKind(r.kind)) continue;
    local.push({
      seq: null,
      opId: r.opId,
      actor: me,
      at: r.at,
      day: localDayOf(r.at, zone),
      kind: r.kind,
      payload: r.payload,
      delivery: 'failed',
      refused: r.reason,
    });
  }
  const drafts = mergeByTime(logged, local);

  // What acts on other events: edits, unsends, reactions, dewdrops. Later ones win.
  const edits = new Map<number, string>();
  const unsends = new Map<number, 'author' | 'safety'>();
  const reactions = new Map<number, Map<PersonId, string>>();
  const dews = new Map<number, Map<PersonId, (number | null)[]>>();
  for (const d of drafts) {
    if (isTombstone(d.payload)) continue;
    const p = obj(d.payload);
    const target = num(p['target']);
    if (target === null) continue;
    if (d.kind === 'edit' && typeof p['text'] === 'string') edits.set(target, p['text']);
    if (d.kind === 'unsend') unsends.set(target, p['by'] === 'safety' ? 'safety' : 'author');
    if (d.kind === 'reaction' && d.actor !== null) {
      const by = reactions.get(target) ?? new Map<PersonId, string>();
      const reaction = str(p['reaction']);
      if (reaction === null) by.delete(d.actor);
      else by.set(d.actor, reaction);
      reactions.set(target, by);
    }
    if (d.kind === 'dewdrop' && d.actor !== null) {
      const by = dews.get(target) ?? new Map<PersonId, (number | null)[]>();
      by.set(d.actor, [...(by.get(d.actor) ?? []), d.seq]);
      dews.set(target, by);
    }
  }
  // A dewdrop taken back is an unsend of the dewdrop: each person's latest one still standing
  // counts, so one given again after being taken back shows again.
  const dewOf = new Map<number, Map<PersonId, number | null>>();
  for (const [target, by] of dews) {
    const standing = new Map<PersonId, number | null>();
    for (const [person, seqs] of by) {
      const kept = seqs.filter((seq) => seq === null || !unsends.has(seq));
      if (kept.length > 0) standing.set(person, kept.at(-1) ?? null);
    }
    if (standing.size > 0) dewOf.set(target, standing);
  }
  const pins = new Set(state?.pins ?? []);
  // A nap is only known to be long when the loaded log shows when it began.
  const lastOpened = new Map<PersonId, number>();

  const items: TimelineItem[] = [];
  let day: string | null = null;
  const days = new Set<string>();
  const divide = (d: Draft) => {
    if (d.day === day) return;
    day = d.day;
    // A day shown twice (a clock that disagrees with the farm's) keeps its rows apart by key.
    let key = `day:${d.day}`;
    for (let i = 2; days.has(key); i += 1) key = `day:${d.day}:${i}`;
    days.add(key);
    items.push({ type: 'day', key, at: d.at, day: d.day });
  };

  for (const d of drafts) {
    const p = obj(d.payload);
    if (d.kind === 'farm_opened' && d.actor !== null) {
      const before = lastOpened.get(d.actor);
      lastOpened.set(d.actor, d.at);
      if (
        d.seq !== null &&
        d.actor !== me &&
        before !== undefined &&
        d.at - before >= LONG_NAP_MS
      ) {
        divide(d);
        items.push({ type: 'back', key: d.opId, seq: d.seq, actor: d.actor });
      }
      continue;
    }
    // A slow post that has arrived reads as a quiet note; before that it stays sealed.
    const kind =
      d.kind === 'slow_post' && (num(p['deliverAt']) ?? Infinity) <= now ? 'quiet_note' : d.kind;
    if (isBubbleKind(kind)) {
      const unsentBy = d.seq === null ? undefined : unsends.get(d.seq);
      if (isTombstone(d.payload) || unsentBy !== undefined) {
        if (d.seq === null) continue;
        const tomb = obj(d.payload)['tombstone'];
        divide(d);
        items.push({
          type: 'unsent',
          key: d.opId,
          seq: d.seq,
          actor: d.actor,
          by: unsentBy ?? (tomb === 'removed' ? 'safety' : 'author'),
        });
        continue;
      }
      const body = bodyOf(kind, d.payload);
      if (body === null) continue;
      const edit = d.seq === null ? undefined : edits.get(d.seq);
      const shown: BubbleBody =
        edit !== undefined && body.kind === 'message' ? { kind: 'message', text: edit } : body;
      const dewBy = d.seq === null ? undefined : dewOf.get(d.seq);
      const reactedBy = d.seq === null ? undefined : reactions.get(d.seq);
      const grouped = new Map<string, PersonId[]>();
      for (const [person, reaction] of reactedBy ?? []) {
        grouped.set(reaction, [...(grouped.get(reaction) ?? []), person]);
      }
      divide(d);
      items.push({
        type: 'bubble',
        key: d.opId,
        seq: d.seq,
        opId: d.opId,
        actor: d.actor,
        at: d.at,
        mine: me !== null && d.actor === me,
        body: shown,
        edited: edit !== undefined,
        replyTo: num(p['replyTo']),
        mentions: Array.isArray(p['mentions']) ? (p['mentions'] as PersonId[]) : [],
        delivery: d.delivery,
        refused: d.refused,
        dew: [...(dewBy?.keys() ?? [])],
        myDew: me !== null ? (dewBy?.get(me) ?? null) : null,
        reactions: [...grouped].map(([reaction, people]) => ({ reaction, people })),
        pinned: d.seq !== null && pins.has(d.seq),
      });
      continue;
    }
    if (isTombstone(d.payload)) continue;
    const line = lineOf(d, p, me, now);
    if (line) {
      // A visit's two arrivals are its first moment, not news; on a farm, arrivals in a row share a line.
      if (line.type === 'line' && line.kind === 'joined' && state?.kind === 'visit') continue;
      const last = items.at(-1);
      if (
        line.type === 'line' &&
        line.kind === 'joined' &&
        last?.type === 'line' &&
        last.kind === 'joined' &&
        line.actor !== null
      ) {
        items[items.length - 1] = { ...last, with: [...(last.with ?? []), line.actor] };
        continue;
      }
      divide(d);
      items.push(line);
    }
  }
  return items;
}

/**
 * The farm's log in its order, with this phone's own writes placed among it by when they were
 * made: a write refused yesterday sits in yesterday, not after today's messages.
 */
function mergeByTime(logged: readonly Draft[], local: readonly Draft[]): Draft[] {
  const pending = [...local].sort((a, b) => a.at - b.at);
  const out: Draft[] = [];
  let i = 0;
  for (const d of logged) {
    while (i < pending.length && (pending[i]?.at ?? Infinity) < d.at)
      out.push(pending[i++] as Draft);
    out.push(d);
  }
  while (i < pending.length) out.push(pending[i++] as Draft);
  return out;
}

function lineOf(
  d: Draft,
  p: Record<string, unknown>,
  me: PersonId | null,
  now: number,
): TimelineItem | null {
  const base = { type: 'line' as const, key: d.opId, seq: d.seq, actor: d.actor, title: null };
  const to = str(p['to']);
  switch (d.kind) {
    case 'firefly':
      return p['action'] === 'left' ? { ...base, kind: 'firefly', to } : null;
    case 'wave':
    case 'hug':
    case 'knock':
      return { ...base, kind: d.kind, to };
    case 'dewdrop':
      // A dewdrop on a message is drawn under it; one for the farm or a friend is a line.
      return num(p['target']) === null ? { ...base, kind: 'dewdrop', to } : null;
    case 'joined':
      return { ...base, kind: 'joined', to: null };
    case 'left':
      return { ...base, kind: 'left', to: null };
    case 'seed_planted':
      return { ...base, kind: 'plan', to: null, title: str(p['title']) };
    case 'slow_post': {
      // Sealed until it arrives; only its sender sees it on its way.
      const deliverAt = num(p['deliverAt']) ?? Infinity;
      if (deliverAt > now) return d.actor === me ? { ...base, kind: 'slow_post', to } : null;
      return null;
    }
    default:
      return null;
  }
}
