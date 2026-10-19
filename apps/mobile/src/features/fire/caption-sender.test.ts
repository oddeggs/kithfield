import { afterEach, describe, expect, it } from '@jest/globals';
import type { Room } from 'livekit-client';

import { CaptionSender } from './caption-sender';

/** LiveKit's sink recorder, stood in for: which track's stream each one listens to. */
const started: string[] = [];
const stopped: string[] = [];
class StandInRecorder {
  readonly track: string;
  constructor(stream: { tracks: { id: string }[] }) {
    this.track = stream.tracks[0]?.id ?? '';
  }
  start() {
    started.push(this.track);
  }
  stop() {
    stopped.push(this.track);
  }
  requestData() {}
  addEventListener() {}
}
class StandInStream {
  constructor(readonly tracks: { id: string }[]) {}
}

const g = globalThis as { MediaRecorder?: unknown; MediaStream?: unknown };
g.MediaRecorder = StandInRecorder;
g.MediaStream = StandInStream;

const roomWithMic = (mic: { id: string }) =>
  ({
    localParticipant: {
      getTrackPublication: () => ({ track: { mediaStreamTrack: mic } }),
    },
  }) as unknown as Room;

afterEach(() => {
  started.length = 0;
  stopped.length = 0;
});

describe('listening to your own mic for captions', () => {
  it('follows the mic when LiveKit replaces its track', () => {
    const mic = { id: 'track-1' };
    const sender = new CaptionSender(
      roomWithMic(mic),
      () => Promise.resolve(true),
      () => undefined,
    );
    expect(sender.start()).toBe(true);
    sender.follow('track-1');
    expect(started).toEqual(['track-1']);
    mic.id = 'track-2';
    sender.follow('track-2');
    expect(stopped).toEqual(['track-1']);
    expect(started).toEqual(['track-1', 'track-2']);
    sender.stop();
  });
});
