import type { FarmId, Seq } from '@kithfield/contracts';

/**
 * Adding a photo at a hangout: picked, uploaded through the media feature and posted to the
 * farm's chat for the plan. Plans don't upload media themselves; the app hands the media
 * feature's uploader in here once at start, and until it does the button waits, dimmed.
 */
export type AddHangoutPhoto = (farm: FarmId, seed: Seq) => Promise<void>;

let provided: AddHangoutPhoto | null = null;

/** Called once by the app with the media feature's uploader. */
export function provideHangoutPhoto(add: AddHangoutPhoto | null): void {
  provided = add;
}

export const hangoutPhoto = (): AddHangoutPhoto | null => provided;
