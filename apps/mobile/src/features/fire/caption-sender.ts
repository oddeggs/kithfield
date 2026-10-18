import { LIMITS } from '@kithfield/contracts';
import { type Room, Track } from 'livekit-client';

import { hasVoice, rateOf, samplesOf, TARGET_RATE, toTargetRate, wavOf } from './pcm';

/*
 * Your own voice, in pieces, for live captions: only while you said yes, your mic is open and
 * someone by the fire has captions on. LiveKit's audio sink taps the mic you already publish (no
 * second recording), each piece is brought down to 16 kHz WAV, and a piece with nobody talking in
 * it isn't sent. Nothing is kept on the phone.
 */

/** A piece of speech: long enough for a sentence, short enough to read as people talk. */
export const PIECE_MS = 6000;

/** LiveKit's recorder over a track's stream (`@livekit/react-native`'s `MediaRecorder` shim). */
interface SinkRecorder {
  start(): void;
  stop(): void;
  requestData(): void;
  addEventListener(
    type: 'dataavailable',
    fn: (e: { data: { byteArray: Uint8Array } }) => void,
  ): void;
}

type RecorderClass = new (stream: unknown) => SinkRecorder;
type StreamClass = new (tracks: unknown[]) => unknown;

/** Sends one WAV piece; answers whether anyone still has captions on. */
export type SendPiece = (wav: Uint8Array, chunk: number, startedAt: number) => Promise<boolean>;

export class CaptionSender {
  private recorder: SinkRecorder | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private chunk = 0;
  private pieceStarted = 0;
  private sending = false;

  constructor(
    private readonly room: Room,
    private readonly send: SendPiece,
    private readonly onQuiet: () => void,
  ) {}

  get running(): boolean {
    return this.recorder !== null;
  }

  /** Starts listening to your mic for captions; false when there is no mic or no sink to tap. */
  start(): boolean {
    if (this.recorder !== null) return true;
    const g = globalThis as { MediaRecorder?: RecorderClass; MediaStream?: StreamClass };
    const pub = this.room.localParticipant.getTrackPublication(Track.Source.Microphone);
    const track = pub?.track?.mediaStreamTrack;
    if (!g.MediaRecorder || !g.MediaStream || !track) return false;
    const recorder = new g.MediaRecorder(new g.MediaStream([track]));
    recorder.addEventListener('dataavailable', (e) => void this.piece(e.data.byteArray));
    recorder.start();
    this.recorder = recorder;
    this.pieceStarted = Date.now();
    this.timer = setInterval(() => recorder.requestData(), PIECE_MS);
    return true;
  }

  stop(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    const recorder = this.recorder;
    this.recorder = null;
    // Stopping hands over what is left; it is dropped (`recorder` is no longer ours).
    recorder?.stop();
  }

  private async piece(bytes: Uint8Array): Promise<void> {
    if (this.recorder === null) return;
    const startedAt = this.pieceStarted;
    const now = Date.now();
    this.pieceStarted = now;
    const rate = rateOf(bytes.length, now - startedAt);
    const speech = toTargetRate(samplesOf(bytes), rate);
    if (!hasVoice(speech) || this.sending) return;
    const wav = wavOf(speech, TARGET_RATE);
    if (wav.length > LIMITS.captionChunkBytes) return;
    this.sending = true;
    try {
      const listening = await this.send(wav, this.chunk++, startedAt);
      if (!listening) {
        this.stop();
        this.onQuiet();
      }
    } catch {
      // A piece that didn't go is simply missed; the next one tries again.
    } finally {
      this.sending = false;
    }
  }
}
