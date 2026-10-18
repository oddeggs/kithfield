import type { MeSettings, QuietHours } from '@kithfield/contracts';

/*
 * The push rules, pure so each one is tested on its own. The cottage runs them when an event
 * arrives and the push consumer runs them again just before sending. In order: a muted farm or a
 * hibernating person → skip; the person has that farm open → skip; quiet hours → hold until they
 * end; over the day's budget → collapse into one "a few things" push, then fold silently.
 */

export const MINUTE_MS = 60_000;
export const DAY_MS = 24 * 60 * MINUTE_MS;
const DAY_MINUTES = 24 * 60;

/**
 * The house floor: nothing between 10pm and 8am local time (`10 On the System`, "Never sent").
 * It always applies in the person's zone, alongside any quiet hours of their own.
 */
export const FLOOR_QUIET = { from: '22:00', to: '08:00' } as const;

/** What a push is, which decides its budget and back-off. */
export type PushCategory = 'doorstep' | 'mention' | 'farm' | 'knock' | 'nudge' | 'reminder';

/**
 * Pushes per budget key: per local day, one doorstep push and, per farm, three mentions and one
 * other; a knock once an hour per porch.
 */
export const CAPS = { doorstep: 1, mention: 3, farm: 1, knock: 1 } as const;

/** A knock is live for a minute; after that it is a quiet line, never a missed-call push. */
export const KNOCK_LIFETIME_MS = 60_000;

/** Gentle nudges a week, by the person's setting. */
export const WEEKLY_NUDGES: Readonly<Record<MeSettings['nudges'], number>> = {
  off: 0,
  few: 2,
  some: 4,
};

/** Nudges sent since the person last came back; the next after this many is the last. */
export const NUDGES_BEFORE_LAST = 2;

export type SkipReason =
  | 'muted'
  | 'hibernating'
  | 'connected'
  | 'nudges_off'
  | 'backed_off'
  | 'nudge_budget'
  | 'expired'
  | 'budget';

export type Decision =
  | { readonly action: 'skip'; readonly reason: SkipReason }
  /** Kept in the cottage until quiet hours end, then decided again. */
  | { readonly action: 'hold'; readonly until: number }
  /** Sent as itself; `last` swaps a nudge for the one that says nudges will rest. */
  | { readonly action: 'send'; readonly last: boolean }
  /** Over budget: the day's one "a few things" push goes out in place of this one. */
  | { readonly action: 'collapse' }
  /** Over budget and the "a few things" push already went out: folded into it. */
  | { readonly action: 'fold' };

export interface DecideInput {
  readonly category: PushCategory;
  readonly at: number;
  /** The job's farm is muted (false for a push that belongs to no farm). */
  readonly muted: boolean;
  readonly hibernating: boolean;
  /** The person has that farm open (only the farm knows; false when unknown). */
  readonly connected: boolean;
  readonly quiet: readonly QuietWindow[];
  readonly nudges: MeSettings['nudges'];
  readonly backOffWhenQuiet: boolean;
  readonly nudgesSinceBack: number;
  readonly nudgesThisWeek: number;
  /** Pushes already sent under this push's budget key. */
  readonly sentToday: number;
  /** The "a few things" push for this push's collapse key already went out today. */
  readonly fewSent: boolean;
}

/** A quiet window in a zone. */
export interface QuietWindow {
  readonly from: string;
  readonly to: string;
  readonly timeZone: string;
}

/**
 * Every window a push must wait out, in the person's zone: the house floor, and their own quiet
 * hours when they set some.
 */
export function quietWindows(own: QuietHours | null, zone: string): QuietWindow[] {
  return own === null
    ? [{ ...FLOOR_QUIET, timeZone: zone }]
    : [
        { ...FLOOR_QUIET, timeZone: zone },
        { ...own, timeZone: zone },
      ];
}

/** When no window applies any more, or null when none applies at `at`. */
export function holdUntil(at: number, windows: readonly QuietWindow[]): number | null {
  let t = at;
  // Windows may chain (one ends inside another); a handful of passes settles any real setting.
  for (let pass = 0; pass < 8; pass += 1) {
    const ends = windows.map((w) => quietEndsAt(t, w)).filter((end) => end !== null);
    if (ends.length === 0) return t === at ? null : t;
    t = Math.max(...ends);
  }
  return t;
}

export function decide(input: DecideInput): Decision {
  const farmBound = input.category !== 'reminder';
  if (input.hibernating) return { action: 'skip', reason: 'hibernating' };
  if (farmBound && input.muted) return { action: 'skip', reason: 'muted' };
  if (input.connected) return { action: 'skip', reason: 'connected' };

  let last = false;
  if (input.category === 'nudge') {
    if (input.nudges === 'off') return { action: 'skip', reason: 'nudges_off' };
    if (input.backOffWhenQuiet) {
      if (input.nudgesSinceBack > NUDGES_BEFORE_LAST) {
        return { action: 'skip', reason: 'backed_off' };
      }
      last = input.nudgesSinceBack === NUDGES_BEFORE_LAST;
    }
    if (input.nudgesThisWeek >= WEEKLY_NUDGES[input.nudges]) {
      return { action: 'skip', reason: 'nudge_budget' };
    }
  }

  const until = holdUntil(input.at, input.quiet);
  if (until !== null) {
    // A knock never waits: by morning it would be a missed call.
    return input.category === 'knock'
      ? { action: 'skip', reason: 'expired' }
      : { action: 'hold', until };
  }

  if (input.category === 'nudge' || input.category === 'reminder') return { action: 'send', last };
  if (input.sentToday < CAPS[input.category]) return { action: 'send', last: false };
  if (input.category === 'knock') return { action: 'skip', reason: 'budget' };
  return input.fewSent ? { action: 'fold' } : { action: 'collapse' };
}

/** `HH:MM` → minutes after midnight. */
export function clockMinutes(value: string): number {
  const [hours, minutes] = value.split(':');
  return Number(hours) * 60 + Number(minutes);
}

/** Quiet windows may wrap midnight (22:00–08:00); an empty window (from = to) is never quiet. */
export function inQuietMinutes(minutes: number, from: number, to: number): boolean {
  if (from === to) return false;
  return from < to ? minutes >= from && minutes < to : minutes >= from || minutes < to;
}

export interface LocalClock {
  /** `YYYY-MM-DD` in the zone. */
  readonly date: string;
  readonly minutes: number;
}

/** The wall clock in `timeZone` at `at`; an unknown zone reads as UTC. */
export function localClock(at: number, timeZone: string): LocalClock {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = formatter(timeZone).formatToParts(new Date(at));
  } catch {
    parts = formatter('UTC').formatToParts(new Date(at));
  }
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((entry) => entry.type === type)?.value ?? '00';
  return {
    date: `${part('year')}-${part('month')}-${part('day')}`,
    minutes: Number(part('hour')) * 60 + Number(part('minute')),
  };
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(timeZone: string): Intl.DateTimeFormat {
  let found = formatters.get(timeZone);
  if (found === undefined) {
    found = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    formatters.set(timeZone, found);
  }
  return found;
}

/**
 * When the quiet window `at` falls in ends (to the minute), or null outside it. A clock change
 * inside the window moves the end by its shift, so it still lands on the window's local end.
 */
export function quietEndsAt(at: number, quiet: QuietWindow): number | null {
  const { minutes } = localClock(at, quiet.timeZone);
  const from = clockMinutes(quiet.from);
  const to = clockMinutes(quiet.to);
  if (!inQuietMinutes(minutes, from, to)) return null;
  const remaining = (to - minutes + DAY_MINUTES) % DAY_MINUTES;
  const end = Math.floor(at / MINUTE_MS) * MINUTE_MS + remaining * MINUTE_MS;
  const landed = localClock(end, quiet.timeZone).minutes;
  const shift = ((to - landed + DAY_MINUTES + DAY_MINUTES / 2) % DAY_MINUTES) - DAY_MINUTES / 2;
  return end + shift * MINUTE_MS;
}
