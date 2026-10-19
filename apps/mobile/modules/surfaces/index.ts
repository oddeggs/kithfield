import { requireOptionalNativeModule, type EventSubscription } from 'expo';

/** A Live Activity's kind: `ActivityTokenRequest['activity']` in `@kithfield/contracts`. */
export type ActivityKind = 'plan_day' | 'fire';

export interface RunningActivity {
  readonly id: string;
  readonly kind: ActivityKind;
  readonly key: string;
  readonly stateJson: string;
}

/** Where the fire sounds: `bluetooth` (AirPods and headsets), `wired`, `iphone`, `speaker`, `airplay`. */
export type AudioKind = 'bluetooth' | 'wired' | 'iphone' | 'speaker' | 'airplay';

export interface AudioRoute {
  readonly output: { readonly kind: AudioKind; readonly name: string };
  readonly input: { readonly kind: AudioKind; readonly name: string } | null;
  /** The headsets the room can use, then the earpiece (`iphone`) and the `speaker`. */
  readonly options: readonly {
    readonly id: string;
    readonly kind: AudioKind;
    readonly name: string;
  }[];
}

export interface SurfacesEvents {
  /** A running activity's update token, hex: the server moves the activity with it. */
  onActivityToken: (event: RunningActivity & { readonly token: string }) => void;
  /** The device's push-to-start token, hex: the server starts the plan's day with it. */
  onPushToStartToken: (event: { readonly token: string }) => void;
  onActivityEnded: (event: RunningActivity) => void;
  /** A button on the fire's Live Activity: `mute`, `unmute` or `leave`. */
  onActivityAction: (event: {
    readonly action: 'mute' | 'unmute' | 'leave';
    readonly farm: string;
  }) => void;
  /** The audio route changed; `reason` is `gone` when a headset went away (an AirPod out). */
  onAudioRoute: (event: AudioRoute & { readonly reason: 'gone' | 'new' | 'other' }) => void;
}

interface SurfacesNative {
  addListener<E extends keyof SurfacesEvents>(
    event: E,
    listener: SurfacesEvents[E],
  ): EventSubscription;
  activitiesEnabled(): boolean;
  listActivities(): Promise<RunningActivity[]>;
  /**
   * `attributesJson` and `stateJson` are a `PlanDayActivity` or `FireActivity`'s `attributes`
   * and `state`. With `push`, the activity gets an update token (`onActivityToken`). Null when
   * iOS refuses (activities off, or the app in the background).
   */
  startActivity(
    kind: ActivityKind,
    key: string,
    attributesJson: string,
    stateJson: string,
    push?: boolean,
  ): Promise<string | null>;
  updateActivity(id: string, stateJson: string): Promise<void>;
  endActivity(id: string, finalStateJson: string | null): Promise<void>;
  audioRoute(): AudioRoute;
  /** A headset by its id from `options`, `iphone` or `speaker`. */
  setAudioRoute(id: string): Promise<void>;
  showAirPlayPicker(): Promise<void>;
  /** Data of one pasteboard type for `seconds`, on this device only (WhatsApp sticker packs). */
  copyToPasteboard(type: string, base64: string, seconds: number): Promise<void>;
}

/**
 * The native surfaces' app side (`modules/surfaces/ios`), or null where it is not built in:
 * tests, and platforms without it.
 */
export const surfaces = requireOptionalNativeModule<SurfacesNative>('Surfaces');
