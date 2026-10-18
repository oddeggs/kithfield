/** The steps of starting the recorder, as the voice note hook drives them. */
export interface RecordingSteps {
  /** Opens the audio session for recording. */
  readonly open: () => Promise<void>;
  readonly prepare: () => Promise<void>;
  readonly record: () => void;
  /** Gives the audio session back; never throws. */
  readonly close: () => Promise<void>;
}

/** How starting went: recording, the finger lifted first, or the phone wouldn't record. */
export type RecordingStart = 'recording' | 'dropped' | 'failed';

/**
 * Starts recording, checking between steps that the mic is still held. A recorder that can't
 * start (no input, the session taken by a call) settles as `failed` with the session given back,
 * so it is never left half open or thrown into the void.
 */
export async function beginRecording(
  steps: RecordingSteps,
  stillWanted: () => boolean,
): Promise<RecordingStart> {
  try {
    await steps.open();
    if (!stillWanted()) {
      await steps.close();
      return 'dropped';
    }
    await steps.prepare();
    steps.record();
    return 'recording';
  } catch {
    await steps.close();
    return 'failed';
  }
}
