import { requireOptionalNativeModule } from 'expo';

/** A Live Activity's kind: `ActivityTokenRequest['activity']` in `@kithfield/contracts`. */
export type ActivityKind = 'plan_day' | 'fire';

export interface RunningActivity {
  readonly id: string;
  readonly kind: ActivityKind;
  readonly key: string;
  readonly stateJson: string;
}

interface SurfacesNative {
  activitiesEnabled(): boolean;
  listActivities(): Promise<RunningActivity[]>;
  /**
   * `attributesJson` and `stateJson` are a `PlanDayActivity` or `FireActivity`'s `attributes`
   * and `state`. Null when iOS refuses (activities off, or the app in the background).
   */
  startActivity(
    kind: ActivityKind,
    key: string,
    attributesJson: string,
    stateJson: string,
  ): Promise<string | null>;
  updateActivity(id: string, stateJson: string): Promise<void>;
  endActivity(id: string, finalStateJson: string | null): Promise<void>;
  /** Data of one pasteboard type for `seconds`, on this device only (WhatsApp sticker packs). */
  copyToPasteboard(type: string, base64: string, seconds: number): Promise<void>;
}

/**
 * The native surfaces' app side (`modules/surfaces/ios`), or null where it is not built in:
 * tests, and platforms without it.
 */
export const surfaces = requireOptionalNativeModule<SurfacesNative>('Surfaces');
