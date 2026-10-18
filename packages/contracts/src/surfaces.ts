import { z } from 'zod';

import { type FarmCommand } from './commands';
import { type NotificationCategory, type PlanPushData, type PushData } from './cottage';
import { SeasonRef, WeatherSource } from './payloads/farm';
import {
  Critter,
  DisplayName,
  EpochMs,
  FarmId,
  FarmKind,
  FarmName,
  HttpUrl,
  Lang,
  LIMITS,
  LocalDate,
  LocalTime,
  OpId,
  PersonId,
  Seq,
  Weather,
  text,
} from './primitives';

/*
 * The app's native surfaces: widgets, Live Activities, notification actions and the share
 * extension. None of them run JavaScript or Skia, so the app writes what they draw into the App
 * Group: JSON in the shapes below, and PNGs it renders offscreen from the art. Times are kept raw,
 * so a widget works out lit windows and sleepy critters against "now" itself.
 */

/** Bumped when a surface file's shape changes; a surface reading a newer one draws nothing. */
export const SURFACES_VERSION = 1;

/** Where the files live inside the App Group container. */
export const APP_GROUP_PATHS = {
  /** `SurfaceData`, rewritten after farm activity, at most every 15 minutes for widgets. */
  data: 'surfaces/data.json',
  /** The PNGs `SurfaceImage` names. */
  images: 'surfaces/images/',
  /** One `ShareDraft` per file, named by its op id, for the app to send. */
  shareOutbox: 'surfaces/share-outbox/',
} as const;

/** A widget opens a window lit when its person opened the farm within this long. */
export const LIT_WINDOW_MS = 3 * 60 * 60_000;

/** A PNG the app rendered into `APP_GROUP_PATHS.images`, by file name. */
export const SurfaceImage = z.string().regex(/^[a-z0-9_-]{1,80}\.png$/);
export type SurfaceImage = z.infer<typeof SurfaceImage>;

/** A link into the app (its own scheme, `kithfield` or `kithfield-dev`), made by the app. */
export const SurfaceLink = z.string().regex(/^kithfield(-dev)?:\/\/[A-Za-z0-9_\-/?=&.%]{0,300}$/);
export type SurfaceLink = z.infer<typeof SurfaceLink>;

/** Someone as a surface draws them: their name and a pre-rendered critter. */
export const SurfacePerson = z.object({
  person: PersonId,
  /** Null for a member whose name is gone. */
  name: DisplayName.nullable(),
  image: SurfaceImage,
});
export type SurfacePerson = z.infer<typeof SurfacePerson>;

/** A critter on a widget, with the times sleepiness and lit windows are worked out from. */
export const SurfaceCritter = SurfacePerson.extend({
  critter: Critter,
  joinedAt: EpochMs,
  lastOpenedAt: EpochMs.nullable(),
  lastWokenAt: EpochMs.nullable(),
  hibernating: z.boolean(),
  pausedUntil: EpochMs.nullable(),
  /** Opens this friend's critter card. */
  link: SurfaceLink,
});
export type SurfaceCritter = z.infer<typeof SurfaceCritter>;

/**
 * One farm or visit, as the widgets and the share extension's picker draw it. `knocks` wobble the
 * knocker's window once, from a pre-rendered entry.
 */
export const SurfaceFarm = z.object({
  farm: FarmId,
  kind: FarmKind,
  /** Null for a visit, which shows `with` instead. */
  name: FarmName.nullable(),
  with: SurfacePerson.nullable(),
  season: SeasonRef,
  images: z.object({ day: SurfaceImage, night: SurfaceImage }),
  critters: z.array(SurfaceCritter).max(LIMITS.members),
  /** The fire, while lit: who is by it (the widget's "Pip and Bea are by the fire"). */
  fire: z
    .object({ litAt: EpochMs, people: z.array(SurfacePerson).max(LIMITS.fireVoices) })
    .nullable(),
  /** The next sprouted plan, for the small widget. */
  nextPlan: z
    .object({
      seed: Seq,
      title: text(80),
      date: LocalDate,
      from: LocalTime.nullable(),
      place: text(120).nullable(),
    })
    .nullable(),
  knocks: z.array(z.object({ from: PersonId, at: EpochMs })).max(LIMITS.members),
  /** Today's weather, for the long-press detail with its attribution. */
  weather: z.object({ day: LocalDate, weather: Weather, source: WeatherSource }).nullable(),
  /** Opens the farm. */
  link: SurfaceLink,
  updatedAt: EpochMs,
});
export type SurfaceFarm = z.infer<typeof SurfaceFarm>;

/** `APP_GROUP_PATHS.data`: everything the surfaces draw, in the app's language. */
export const SurfaceData = z.object({
  version: z.literal(SURFACES_VERSION),
  lang: Lang,
  writtenAt: EpochMs,
  farms: z.array(SurfaceFarm).max(100),
});
export type SurfaceData = z.infer<typeof SurfaceData>;

/* Live Activities */

/**
 * The day of a sprouted plan, from 2 hours before it to 2 hours after: who is there (checked in)
 * and who is on their way (said they're in). Each update steps one critter along the path.
 */
export const PlanDayActivity = z.object({
  attributes: z.object({
    farm: FarmId,
    seed: Seq,
    title: text(80),
    place: text(120).nullable(),
    date: LocalDate,
    from: LocalTime.nullable(),
    link: SurfaceLink,
  }),
  state: z.object({
    here: z.array(SurfacePerson).max(LIMITS.members),
    onTheWay: z.array(SurfacePerson).max(LIMITS.members),
  }),
});
export type PlanDayActivity = z.infer<typeof PlanDayActivity>;

/**
 * By the fire, on this phone only: starts when the person sits down, ends when they head home or
 * 10 minutes after they're alone. Never started on someone else's phone.
 */
export const FireActivity = z.object({
  attributes: z.object({ farm: FarmId, farmName: FarmName.nullable(), link: SurfaceLink }),
  state: z.object({
    people: z.array(SurfacePerson).max(LIMITS.fireVoices),
    talking: PersonId.nullable(),
    muted: z.boolean(),
    listening: z.boolean(),
  }),
});
export type FireActivity = z.infer<typeof FireActivity>;

/** An APNs token for Live Activities, hex. */
export const ActivityPushToken = z.string().regex(/^[0-9a-f]{64,256}$/);

/**
 * `PUT /v1/devices/:deviceId/activity-start`: the device's push-to-start token, so the server can
 * start the plan-day activity 2 hours before a plan. 204.
 */
export const ActivityStartTokenRequest = z.object({ token: ActivityPushToken });
export type ActivityStartTokenRequest = z.infer<typeof ActivityStartTokenRequest>;

/**
 * `PUT /v1/devices/:deviceId/activities`: a running activity's update token, so the server can
 * move it along; `DELETE` the same path with the same body (without `token`) when it ends. 204.
 */
export const ActivityTokenRequest = z.discriminatedUnion('activity', [
  z.object({ activity: z.literal('plan_day'), farm: FarmId, seed: Seq, token: ActivityPushToken }),
  z.object({ activity: z.literal('fire'), farm: FarmId, token: ActivityPushToken }),
]);
export type ActivityTokenRequest = z.infer<typeof ActivityTokenRequest>;

/**
 * A silent push's `data` (no alert, no sound, no badge) that asks the app to rewrite
 * `SurfaceData` and reload its widgets or activity: the fire lit or out, a knock, a plan's day.
 * The fire never sends an alert push; this is how the widget learns of it.
 */
export const SurfaceRefreshData = z.object({
  refresh: z.enum(['widgets', 'activity']),
  farm: FarmId,
  reason: z.enum(['fire', 'knock', 'plan', 'farm']),
});
export type SurfaceRefreshData = z.infer<typeof SurfaceRefreshData>;

/* Notification actions */

/** What a long-press on a push offers: "I'm in", "Can't this time", "Leave a dewdrop". */
export const NotificationAction = z.enum(['im_in', 'cant', 'dewdrop']);
export type NotificationAction = z.infer<typeof NotificationAction>;

/** The actions each category offers, in order. */
export const NOTIFICATION_ACTIONS = {
  plan: ['im_in', 'cant', 'dewdrop'],
  tend: ['dewdrop'],
} as const satisfies Record<NotificationCategory, readonly NotificationAction[]>;

/** What a dewdrop can sit on: something said in the chat (the farm's own rule, `checkTargets`). */
export const DEWDROP_TARGET_KINDS: ReadonlySet<string> = new Set([
  'message',
  'sticker',
  'media',
  'voice',
  'link',
  'quiet_note',
]);

/**
 * The write a notification action sends, without opening the app: `POST /v1/farms/:farm/cmd` with
 * the device's action key (`Kithfield-Action-Key`). `category` is the notification's category, and
 * `data` its `PushData` (a `PlanPushData` for a plan). "I'm in" and "Can't this time" answer the
 * plan (`rsvp in` or `out`). "Leave a dewdrop" puts one on the event the push was about when that
 * is something said in the chat, and otherwise (a plan, a gift on the doorstep) leaves it on the
 * farm. Null when the push can't take that action.
 */
export const actionCommand = (
  action: NotificationAction,
  category: NotificationCategory,
  data: PushData | PlanPushData,
  opId: OpId,
): { farm: FarmId; command: FarmCommand } | null => {
  const { farm } = data;
  const seed = 'seed' in data ? data.seed : null;
  if (farm === null) return null;
  if (!(NOTIFICATION_ACTIONS[category] as readonly NotificationAction[]).includes(action)) {
    return null;
  }
  if (action === 'dewdrop') {
    const said = category === 'tend' && data.seq !== null && DEWDROP_TARGET_KINDS.has(data.kind);
    const payload = said && data.seq !== null ? { target: data.seq } : {};
    return { farm, command: { opId, kind: 'dewdrop', payload } };
  }
  if (seed === null) return null;
  const answer = action === 'im_in' ? 'in' : 'out';
  return { farm, command: { opId, kind: 'rsvp', payload: { seed, answer } } };
};

/* The share extension */

/**
 * Something shared into Kithfield from another app that the extension couldn't send itself (a
 * large file, or no connection), left for the app in `APP_GROUP_PATHS.shareOutbox`. The app sends
 * it as the writer `opId` names, so a draft sent twice applies once, and then deletes the file.
 * Files are paths inside the App Group.
 */
export const ShareDraft = z
  .object({
    opId: OpId,
    farm: FarmId,
    at: EpochMs,
    text: text(LIMITS.message).optional(),
    url: HttpUrl.optional(),
    files: z
      .array(
        z.object({
          path: z.string().regex(/^surfaces\/share-outbox\/[A-Za-z0-9_.-]{1,128}$/),
          mime: z.string().regex(/^[a-z]+\/[a-z0-9.+-]{1,80}$/),
          bytes: z.int().min(1).max(LIMITS.uploadBytes),
        }),
      )
      .max(LIMITS.mediaItems),
  })
  .refine((d) => d.text !== undefined || d.url !== undefined || d.files.length > 0, {
    message: 'A share carries something',
  });
export type ShareDraft = z.infer<typeof ShareDraft>;
