import type { LocalDate, LocalTime } from '@kithfield/contracts';
import type { Translate } from '@kithfield/i18n';
import { addDays, weekday } from '@kithfield/farm';

/*
 * Days and times as plans say them. Plan days are calendar days in the farm's time zone; a
 * remember-me nudge is a moment in this phone's own time, since it is for this person alone.
 */

const SATURDAY = 6;

/** The day choices the plant sheet offers first: the coming weekend and the one after. */
export function weekendChoices(today: LocalDate): {
  saturday: LocalDate;
  sunday: LocalDate;
  nextSaturday: LocalDate;
} {
  const tomorrow = addDays(today, 1);
  const saturday = addDays(tomorrow, (SATURDAY - weekday(tomorrow) + 7) % 7);
  return { saturday, sunday: addDays(saturday, 1), nextSaturday: addDays(saturday, 7) };
}

/** The next two weeks from today, for picking a date of one's own. */
export function fortnight(today: LocalDate): LocalDate[] {
  return Array.from({ length: 14 }, (_, i) => addDays(today, i));
}

const WD = [
  'plans.wd.0',
  'plans.wd.1',
  'plans.wd.2',
  'plans.wd.3',
  'plans.wd.4',
  'plans.wd.5',
  'plans.wd.6',
] as const;
const WD_LONG = [
  'plans.wdLong.0',
  'plans.wdLong.1',
  'plans.wdLong.2',
  'plans.wdLong.3',
  'plans.wdLong.4',
  'plans.wdLong.5',
  'plans.wdLong.6',
] as const;
const MONTHS = [
  'plans.month.1',
  'plans.month.2',
  'plans.month.3',
  'plans.month.4',
  'plans.month.5',
  'plans.month.6',
  'plans.month.7',
  'plans.month.8',
  'plans.month.9',
  'plans.month.10',
  'plans.month.11',
  'plans.month.12',
] as const;

const monthOf = (day: LocalDate) => Number(day.slice(5, 7));
const dateOf = (day: LocalDate) => Number(day.slice(8, 10));

/** "Sat 24 Oct", or "Sun 25" without its month. */
export function formatDay(t: Translate, day: LocalDate, withMonth = true): string {
  const params = {
    weekday: t(WD[weekday(day)] ?? WD[0]),
    day: dateOf(day),
    month: t(MONTHS[monthOf(day) - 1] ?? MONTHS[0]),
  };
  return t(withMonth ? 'plans.date.long' : 'plans.date.short', params);
}

/** A list of days, each naming its month only when it changes: "Sat 24 Oct", "Sun 25". */
export function formatDays(t: Translate, days: readonly LocalDate[]): string[] {
  return days.map((d, i) => formatDay(t, d, i === 0 || monthOf(d) !== monthOf(days[i - 1] ?? d)));
}

export const weekdayName = (t: Translate, day: LocalDate): string =>
  t(WD_LONG[weekday(day)] ?? WD_LONG[0]);

/** "Fri": a day's short name. */
export const weekdayShort = (t: Translate, day: LocalDate): string =>
  t(WD[weekday(day)] ?? WD[0]);

/** "4pm", "4:30pm". */
export function formatTime(t: Translate, time: LocalTime): string {
  const [h = 0, m = 0] = time.split(':').map(Number);
  const period = t(h < 12 ? 'plans.time.am' : 'plans.time.pm');
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m === 0
    ? t('plans.time.clock', { hour, period })
    : t('plans.time.clockMinutes', { hour, minute: String(m).padStart(2, '0'), period });
}

/**
 * The day a plan voted on settles: two days before its earliest day, as "the fuller one wins on
 * Thursday" does for a Saturday, but never before today.
 */
export function settleDayFor(days: readonly LocalDate[], today: LocalDate): LocalDate | null {
  const earliest = [...days].sort()[0];
  if (earliest === undefined) return null;
  const settle = addDays(earliest, -2);
  return settle < today ? today : settle;
}

/** The Monday-to-Sunday week a day falls in. */
export function weekOf(day: LocalDate): LocalDate[] {
  const monday = addDays(day, -((weekday(day) + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/* Remember-me nudges, in this phone's time */

/** Words for a day that a message may mention, in English and Vietnamese, by weekday (0 Sunday). */
const WEEKDAY_WORDS: readonly (readonly string[])[] = [
  ['sunday', 'chủ nhật'],
  ['monday', 'thứ hai', 'thứ 2'],
  ['tuesday', 'thứ ba', 'thứ 3'],
  ['wednesday', 'thứ tư', 'thứ 4'],
  ['thursday', 'thứ năm', 'thứ 5'],
  ['friday', 'thứ sáu', 'thứ 6'],
  ['saturday', 'thứ bảy', 'thứ 7'],
];
const TOMORROW_WORDS = ['tomorrow', 'ngày mai'];

const startOfLocalDay = (at: Date): Date =>
  new Date(at.getFullYear(), at.getMonth(), at.getDate());
const plusDays = (at: Date, days: number): Date =>
  new Date(at.getFullYear(), at.getMonth(), at.getDate() + days);

/**
 * The day a message is about: the first weekday it names (the next one, counting today), or
 * tomorrow when it says so, else today. "big interview on thursday" is about the coming Thursday.
 */
export function dayMentioned(text: string, now: Date): Date {
  const lower = text.normalize('NFC').toLowerCase();
  const today = startOfLocalDay(now);
  let best: { at: number; day: Date } | null = null;
  WEEKDAY_WORDS.forEach((words, wd) => {
    for (const word of words) {
      const at = lower.search(new RegExp(`(^|[^\\p{L}])${word}($|[^\\p{L}])`, 'u'));
      if (at >= 0 && (best === null || at < best.at)) {
        best = { at, day: plusDays(today, (wd - today.getDay() + 7) % 7) };
      }
    }
  });
  if (best !== null) return (best as { day: Date }).day;
  if (TOMORROW_WORDS.some((w) => lower.includes(w))) return plusDays(today, 1);
  return today;
}

export type NudgeChoice = 'morning' | 'evening' | 'weekend';

const MORNING_HOUR = 9;
const EVENING_HOUR = 18;
const WEEKEND_HOUR = 10;

const isWeekend = (day: Date) => day.getDay() === 0 || day.getDay() === SATURDAY;
const atHour = (day: Date, hour: number) =>
  new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour);

/** The first day from `day` on (it included) that `fits` and whose `hour` is still to come. */
function nextAt(day: Date, hour: number, now: Date, fits: (d: Date) => boolean): Date {
  let d = day;
  while (!fits(d) || atHour(d, hour).getTime() <= now.getTime()) d = plusDays(d, 1);
  return atHour(d, hour);
}

/**
 * When each nudge choice lands: the morning or evening of the day after the one the message is
 * about, or the weekend on or after it. The day is read from when the message was sent; a time
 * already past moves on to the next morning, evening or weekend.
 */
export function nudgeTimes(text: string, sentAt: Date, now: Date): Record<NudgeChoice, Date> {
  const after = plusDays(dayMentioned(text, sentAt), 1);
  const any = () => true;
  return {
    morning: nextAt(after, MORNING_HOUR, now, any),
    evening: nextAt(after, EVENING_HOUR, now, any),
    weekend: nextAt(after, WEEKEND_HOUR, now, isWeekend),
  };
}

/** A phone-time moment as a plan day and wall-clock time, for formatting. */
export function localParts(at: Date): { day: LocalDate; time: LocalTime } {
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    day: `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`,
    time: `${pad(at.getHours())}:${pad(at.getMinutes())}`,
  };
}
