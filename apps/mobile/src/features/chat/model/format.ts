import type { Language } from '@kithfield/i18n';

/*
 * Times as the chat says them: "8:12" today, "Tue" this week, "Oct 2" this year, "Sep" for
 * longer ago in the list; "thursday, after dinner" over a day's messages; "2:48" for a voice note.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

const locale = (language: Language) => (language === 'vi' ? 'vi-VN' : 'en-US');

function parts(at: number, language: Language, timeZone: string | null, options: object) {
  try {
    return new Intl.DateTimeFormat(locale(language), {
      ...(timeZone ? { timeZone } : {}),
      ...options,
    }).format(at);
  } catch {
    return new Intl.DateTimeFormat(locale(language), options).format(at);
  }
}

/** Calendar days between two instants in a time zone (0 is the same day). */
export function daysBetween(from: number, to: number, timeZone: string | null): number {
  const day = (at: number) => {
    const [m, d, y] = parts(at, 'en', timeZone, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .split('/')
      .map(Number);
    return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  };
  return Math.round((day(to) - day(from)) / DAY_MS);
}

/** A row's time in the chat list: the time today, a weekday this week, a date this year, a month. */
export function listTime(
  at: number,
  now: number,
  language: Language,
  timeZone: string | null = null,
): string {
  const days = daysBetween(at, now, timeZone);
  if (days <= 0)
    return parts(at, language, timeZone, { hour: 'numeric', minute: '2-digit' }).replace(
      /\s?[AP]M$/i,
      '',
    );
  if (days < 7) return parts(at, language, timeZone, { weekday: 'short' });
  const sameYear =
    parts(at, 'en', timeZone, { year: 'numeric' }) ===
    parts(now, 'en', timeZone, { year: 'numeric' });
  if (days < 60 || sameYear) {
    return days < 45
      ? parts(at, language, timeZone, { month: 'short', day: 'numeric' })
      : parts(at, language, timeZone, { month: 'short' });
  }
  return parts(at, language, timeZone, { month: 'short', year: 'numeric' });
}

/** A search result's date: "Today", "Yesterday" (from copy), else "Aug 14". */
export function shortDate(
  at: number,
  now: number,
  language: Language,
  timeZone: string | null = null,
): string {
  const days = daysBetween(at, now, timeZone);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return parts(at, language, timeZone, { month: 'short', day: 'numeric' });
}

export type DayPart = 'morning' | 'afternoon' | 'afterDinner' | 'late';

/** Which part of the day an hour falls in, as the day dividers say it. */
export function dayPartOf(hour: number): DayPart {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 22) return 'afterDinner';
  return 'late';
}

/** The hour of an instant in a time zone. */
export function hourOf(at: number, timeZone: string | null): number {
  const h = Number(parts(at, 'en', timeZone, { hour: 'numeric', hour12: false }));
  return Number.isFinite(h) ? h % 24 : 0;
}

/**
 * The day in a divider, lowercase as the hand face writes it: today, yesterday, a weekday within
 * the week, else a date.
 */
export function dividerDay(
  at: number,
  now: number,
  language: Language,
  timeZone: string | null,
): string {
  const days = daysBetween(at, now, timeZone);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  const text =
    days < 7
      ? parts(at, language, timeZone, { weekday: 'long' })
      : parts(at, language, timeZone, { day: 'numeric', month: 'long' });
  return text.toLocaleLowerCase(locale(language));
}

/** A duration as minutes and seconds: "2:48", "0:04". */
export function clock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** A month heading over shared media: "October", or "October 2025" in another year. */
export function monthHeading(
  at: number,
  now: number,
  language: Language,
  timeZone: string | null = null,
): string {
  const sameYear =
    parts(at, 'en', timeZone, { year: 'numeric' }) ===
    parts(now, 'en', timeZone, { year: 'numeric' });
  const text = parts(
    at,
    language,
    timeZone,
    sameYear ? { month: 'long' } : { month: 'long', year: 'numeric' },
  );
  return text.charAt(0).toLocaleUpperCase(locale(language)) + text.slice(1);
}

/** The month an instant falls in, `YYYY-MM`, for grouping. */
export function monthKey(at: number, timeZone: string | null = null): string {
  const [m, y] = parts(at, 'en', timeZone, { year: 'numeric', month: '2-digit' }).split('/');
  return `${y}-${m}`;
}

/** "Thursday 7:42pm" for the viewer's subtitle. */
export function weekdayTime(
  at: number,
  language: Language,
  timeZone: string | null = null,
): string {
  const day = parts(at, language, timeZone, { weekday: 'long' });
  const time = parts(at, language, timeZone, { hour: 'numeric', minute: '2-digit' }).replace(
    /\s?([AP])M$/i,
    (_m, x: string) => `${x.toLowerCase()}m`,
  );
  return `${day} ${time}`;
}
