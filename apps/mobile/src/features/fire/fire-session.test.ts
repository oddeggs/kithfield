import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Room } from 'livekit-client';
import type { FireTokenResponse } from '@kithfield/contracts';

import { FireSession } from './fire-session';

/* LiveKit and the audio session, stood in for: what a sitting asks of them is what's checked. */

const mockAudio = { start: jest.fn(), stop: jest.fn() };

jest.mock('@livekit/react-native', () => ({
  registerGlobals: () => undefined,
  AudioSession: {
    startAudioSession: () => Promise.resolve(mockAudio.start()),
    stopAudioSession: () => Promise.resolve(mockAudio.stop()),
  },
}));

jest.mock('react-native-reanimated', () => ({
  makeMutable: (initial: number) => {
    let value = initial;
    return {
      get: () => value,
      set: (next: number) => {
        value = next;
      },
    };
  },
}));

jest.mock('livekit-client', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- inside a mock factory
  const { EventEmitter } = require('events') as { EventEmitter: new () => object };
  class Participant {
    attributes: Record<string, string> = {};
    isSpeaking = false;
    audioLevel = 0;
    isMicrophoneEnabled = false;
    isCameraEnabled = false;
    isScreenShareEnabled = false;
    joinedAt = new Date(0);
    permissions = { canPublish: true };
    identity: string;
    constructor(name: string) {
      this.identity = name;
    }
    getTrackPublication() {
      return undefined;
    }
  }
  class Room extends EventEmitter {
    static last: Room | null = null;
    static Participant = Participant;
    localParticipant = new Participant('me');
    remoteParticipants = new Map<string, Participant>();
    connected = 0;
    connect() {
      this.connected += 1;
      return Promise.resolve();
    }
    disconnect() {
      return Promise.resolve();
    }
    constructor() {
      super();
      Room.last = this;
    }
  }
  return {
    Room,
    RoomEvent: new Proxy({}, { get: (_t, k) => String(k) }),
    ConnectionQuality: { Poor: 'poor', Lost: 'lost', Good: 'good' },
    Track: { Source: { Microphone: 'microphone', Camera: 'camera' } },
  };
});

type StandIn = {
  last: (EventEmitter & StandInRoom) | null;
  Participant: new (identity: string) => object;
};
type StandInRoom = { connected: number; remoteParticipants: Map<string, object> };
type EventEmitter = { emit: (event: string, ...args: unknown[]) => boolean };
const standIn = Room as unknown as StandIn;

const tokenWhenReleased = () => {
  let release: () => void = () => undefined;
  const answer = new Promise<FireTokenResponse>((resolve) => {
    release = () =>
      resolve({
        url: 'ws://lk',
        token: 't'.repeat(20),
        room: 'fire-a',
        expiresAt: 0,
        captionsAvailable: false,
      });
  });
  return { token: () => answer, release: () => release() };
};

beforeEach(() => {
  mockAudio.start.mockClear();
  mockAudio.stop.mockClear();
});

describe('a sitting', () => {
  it('never opens the audio session when you head home while it is still connecting', async () => {
    const gate = tokenWhenReleased();
    const session = new FireSession('farm-a', { token: gate.token });
    const sitting = session.sit('listen');
    await session.leave();
    gate.release();
    expect(await sitting).toBe(false);
    expect(mockAudio.start).not.toHaveBeenCalled();
    expect(standIn.last?.connected).toBe(0);
  });

  it('forgets the loudness of someone who has gone home', async () => {
    const gate = tokenWhenReleased();
    const session = new FireSession('farm-a', { token: gate.token });
    gate.release();
    await session.sit('join');
    const room = standIn.last;
    if (!room) throw new Error('no room');
    const bea = new standIn.Participant('bea');
    room.remoteParticipants.set('bea', bea);
    session.levelOf('bea');
    expect(session.heldLevels()).toContain('bea');
    room.remoteParticipants.delete('bea');
    room.emit('ParticipantDisconnected', bea);
    expect(session.heldLevels()).not.toContain('bea');
    await session.leave();
  });

  it('shows caption lines from the server only, never one a phone sent', async () => {
    const gate = tokenWhenReleased();
    const session = new FireSession('farm-a', { token: gate.token });
    gate.release();
    await session.sit('join');
    const room = standIn.last;
    if (!room) throw new Error('no room');
    const line = (text: string) =>
      new TextEncoder().encode(
        JSON.stringify({ speaker: 'bea', chunk: 1, said: 'en', text, translation: null }),
      );
    const forger = new standIn.Participant('kit');
    room.emit('DataReceived', line('words Bea never said'), forger, undefined, 'captions');
    expect(session.snapshot().captions).toEqual([]);
    room.emit('DataReceived', line('hello'), undefined, undefined, 'captions');
    expect(session.snapshot().captions).toMatchObject([{ kind: 'line', line: { text: 'hello' } }]);
    await session.leave();
  });
});
