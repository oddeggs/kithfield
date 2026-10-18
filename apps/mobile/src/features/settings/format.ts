import type {
  FarmNotifications,
  Hemisphere,
  LocalTime,
  QuietHours,
  Season,
} from '@kithfield/contracts';
import { seasonOf } from '@kithfield/farm';
import type { Language } from '@kithfield/i18n';

/* Pure helpers behind the settings screens: what to draw and say, never how. */

export { castOf, lookOf, sceneLook as sceneAttrsOf } from '../../ui/art/critter-look';

/** Time zones south of the equator, by their area or exact name; the rest count as north. */
const SOUTH = [
  /^Australia\//,
  /^Antarctica\//,
  /^Pacific\/(Auckland|Chatham|Fiji|Tongatapu|Apia|Noumea|Efate|Tahiti|Rarotonga|Port_Moresby)$/,
  /^America\/(Argentina\/.+|Buenos_Aires|Santiago|Sao_Paulo|Montevideo|Asuncion|La_Paz|Lima|Punta_Arenas|Recife|Fortaleza|Bahia|Belem|Maceio|Cuiaba|Campo_Grande|Porto_Velho|Rio_Branco|Manaus)$/,
  /^Africa\/(Johannesburg|Maputo|Harare|Lusaka|Windhoek|Gaborone|Maseru|Mbabane|Lubumbashi|Blantyre|Luanda|Dar_es_Salaam|Antananarivo)$/,
  /^Indian\/(Mauritius|Reunion|Antananarivo|Mayotte)$/,
  /^Atlantic\/(St_Helena|South_Georgia|Stanley)$/,
];

/** Which half of the world a time zone is in, for the seasons on your own screens. */
export const hemisphereOfZone = (zone: string): Hemisphere =>
  SOUTH.some((re) => re.test(zone)) ? 'south' : 'north';

/** Today's calendar day (`YYYY-MM-DD`) in a time zone. */
export function dayIn(zone: string, now: number): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(now));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '01';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** The season where this phone is, for scenes that aren't a farm's. */
export const seasonHere = (zone: string, now: number): Season =>
  seasonOf(dayIn(zone, now), hemisphereOfZone(zone)).season;

/** The house floor: no push between these, whatever quiet hours say. */
export const HOUSE_HOURS: QuietHours = { from: '22:00', to: '08:00' };

/** Quiet hours one tap away; null is only the house hours. */
export const QUIET_PRESETS: readonly (QuietHours | null)[] = [
  null,
  { from: '21:00', to: '08:00' },
  { from: '22:00', to: '09:00' },
  { from: '21:00', to: '09:00' },
  { from: '20:00', to: '08:00' },
];

export const sameHours = (a: QuietHours | null, b: QuietHours | null) =>
  a === null || b === null ? a === b : a.from === b.from && a.to === b.to;

/** A wall-clock time as people read it: "9pm" or "9:30pm" in English, "21:00" in Vietnamese. */
export function clockTime(time: LocalTime, language: Language): string {
  const [h = 0, m = 0] = time.split(':').map(Number);
  if (language === 'vi') return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  const hour = h % 12 === 0 ? 12 : h % 12;
  const half = h < 12 ? 'am' : 'pm';
  return m === 0 ? `${hour}${half}` : `${hour}:${String(m).padStart(2, '0')}${half}`;
}

/** A time zone as people say it: the city after the last slash, with spaces. */
export const zoneName = (zone: string) => (zone.split('/').pop() ?? zone).replace(/_/g, ' ');

/** How long ago a device was active, for the devices list. */
export type Ago =
  | { readonly kind: 'now' }
  | { readonly kind: 'today' }
  | { readonly kind: 'days'; readonly count: number }
  | { readonly kind: 'months'; readonly count: number };

export function agoOf(at: number, now: number): Ago {
  const minutes = (now - at) / 60_000;
  if (minutes < 5) return { kind: 'now' };
  const days = Math.floor(minutes / (60 * 24));
  if (days < 1) return { kind: 'today' };
  if (days < 60) return { kind: 'days', count: days };
  return { kind: 'months', count: Math.floor(days / 30) };
}

export type MuteChoice = 'hour' | 'morning' | 'week' | 'always';

export const MUTE_CHOICES: readonly MuteChoice[] = ['hour', 'morning', 'week', 'always'];

/** Tomorrow at 08:00 on this phone's clock. */
function nextMorning(now: number): number {
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  d.setHours(8, 0, 0, 0);
  return d.getTime();
}

/** When a mute choice ends. */
export function muteUntil(choice: MuteChoice, now: number): FarmNotifications['mutedUntil'] {
  switch (choice) {
    case 'hour':
      return now + 60 * 60_000;
    case 'morning':
      return nextMorning(now);
    case 'week':
      return now + 7 * 24 * 60 * 60_000;
    case 'always':
      return 'always';
  }
}

/** Which choice a mute reads as, by how long it has left, so the radio stays on what was picked. */
export function muteChoiceOf(
  mutedUntil: FarmNotifications['mutedUntil'],
  now: number,
): MuteChoice | null {
  if (mutedUntil === null) return null;
  if (mutedUntil === 'always') return 'always';
  const left = mutedUntil - now;
  if (left <= 0) return null;
  if (left <= 60 * 60_000) return 'hour';
  if (left <= 26 * 60 * 60_000) return 'morning';
  return 'week';
}

/** The summary on the farm settings' Notifications row. */
export const notifySummary = (n: FarmNotifications, now: number): 'muted' | 'every' | 'gentle' =>
  muteChoiceOf(n.mutedUntil, now) !== null ? 'muted' : n.knockFor.messages ? 'every' : 'gentle';

/** How long a new invite link should work. */
export type LinkLife = 'always' | 'day' | 'week' | 'month';

export const LINK_LIVES: readonly LinkLife[] = ['always', 'day', 'week', 'month'];

export const linkExpiry = (life: LinkLife, now: number): number | null =>
  life === 'always' ? null : now + { day: 1, week: 7, month: 30 }[life] * 24 * 60 * 60_000;

/** A link as the invite card shows it: no scheme, no trailing slash. */
export const shortLink = (url: string) => url.replace(/^https?:\/\//, '').replace(/\/$/, '');

/**
 * The one-time code in a computer's sign-in QR: only from `https://kithfield.com/desktop#<code>`
 * (or the development host). Null for anything else the camera sees. Read with a pattern, not
 * `URL`, which React Native only half implements.
 */
export function desktopCodeOf(data: string): string | null {
  const match = /^https:\/\/(?:dev\.)?kithfield\.com\/desktop#([A-Za-z0-9_-]{16,128})$/.exec(
    data.trim(),
  );
  return match?.[1] ?? null;
}

const originOf = (url: string) =>
  /^(https?:\/\/[^/?#@]+)(?:[/?#]|$)/i.exec(url)?.[1]?.toLowerCase();

/** Whether a link the server handed back points at the API's own scheme and host. */
export function isOwnLink(link: string, apiBase: string): boolean {
  const own = originOf(apiBase);
  return own !== undefined && originOf(link) === own;
}
