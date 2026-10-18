import { AudioSession, registerGlobals } from '@livekit/react-native';
import {
  FIRE_CAPTION_TOPIC,
  type FarmId,
  type FireTokenResponse,
  type LanguageTag,
} from '@kithfield/contracts';
import {
  ConnectionQuality,
  type LocalVideoTrack,
  type Participant,
  type RemoteParticipant,
  Room,
  RoomEvent,
  Track,
} from 'livekit-client';
import { makeMutable, type SharedValue } from 'react-native-reanimated';

import { addRow, lineFrom, type CaptionRow } from './caption-lines';
import { bySitting, type FireMode, type FirePerson } from './room-model';

/*
 * One sitting by the fire: a LiveKit room, joined with a token from the API, read as the people
 * by the fire and how each is there. Voices play as they arrive; nothing is recorded. The screen
 * reads `snapshot()` and each person's loudness as a shared value, for the critters' lips.
 */

let globalsReady = false;

/** LiveKit's WebRTC globals, once per app run. */
export function readyCalls(): void {
  if (globalsReady) return;
  registerGlobals();
  globalsReady = true;
}

/** Someone flipped their lantern round to show what's in front of them: a room message. */
export const LOOK_TOPIC = 'look';

/** How long a poor connection lasts before their critter dozes and their audio pauses. */
export const WEAK_AFTER_MS = 3000;

/** How often loudness is read for the lips: on twos. */
const LEVEL_MS = 1000 / 12;

export type SessionStatus = 'idle' | 'connecting' | 'live' | 'reconnecting' | 'closed' | 'failed';

export interface FireSnapshot {
  readonly status: SessionStatus;
  /** Everyone by the fire, you included, in the order they sat down. */
  readonly people: readonly FirePerson[];
  /** Who spoke last apart from you, for where a gesture goes. */
  readonly lastSpeaker: string | null;
  /** Who is showing something with their lantern flipped round. */
  readonly showing: string | null;
  readonly captions: readonly CaptionRow[];
  /** Someone by the fire has captions on, so consenting speakers' voices are captioned. */
  readonly captioning: boolean;
}

const EMPTY: FireSnapshot = {
  status: 'idle',
  people: [],
  lastSpeaker: null,
  showing: null,
  captions: [],
  captioning: false,
};

/** What the session asks of the app: a room token for this farm. */
export interface SessionDeps {
  readonly token: (mode: FireMode) => Promise<FireTokenResponse>;
}

export class FireSession {
  readonly room: Room;
  private state: FireSnapshot = EMPTY;
  private readonly listeners = new Set<() => void>();
  private readonly levels = new Map<string, SharedValue<number>>();
  /** The loudest voice by the fire now, for the flame. */
  readonly loudest: SharedValue<number> = makeMutable(0);
  private readonly poorSince = new Map<string, number>();
  private readonly showing = new Set<string>();
  /** Remote voices paused for a weak connection. */
  private readonly paused = new Set<string>();
  private levelTimer: ReturnType<typeof setInterval> | null = null;
  private weakTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private refreshQueued = false;
  private closed = false;

  constructor(
    readonly farm: FarmId,
    private readonly deps: SessionDeps,
  ) {
    readyCalls();
    this.room = new Room({ adaptiveStream: true, dynacast: true });
    const refresh = () => this.queueRefresh();
    for (const e of [
      RoomEvent.ParticipantConnected,
      RoomEvent.ParticipantDisconnected,
      RoomEvent.TrackPublished,
      RoomEvent.TrackUnpublished,
      RoomEvent.TrackSubscribed,
      RoomEvent.TrackUnsubscribed,
      RoomEvent.TrackMuted,
      RoomEvent.TrackUnmuted,
      RoomEvent.LocalTrackPublished,
      RoomEvent.LocalTrackUnpublished,
      RoomEvent.ParticipantAttributesChanged,
      RoomEvent.ParticipantPermissionsChanged,
    ] as const) {
      this.room.on(e, refresh);
    }
    this.room.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
      const other = speakers.find((p) => p.identity !== this.room.localParticipant.identity);
      if (other) this.state = { ...this.state, lastSpeaker: other.identity };
      this.queueRefresh();
    });
    this.room.on(RoomEvent.ConnectionQualityChanged, (q: ConnectionQuality, p: Participant) =>
      this.quality(p, q),
    );
    this.room.on(RoomEvent.ParticipantDisconnected, (p: RemoteParticipant) => {
      this.poorSince.delete(p.identity);
      this.showing.delete(p.identity);
    });
    this.room.on(RoomEvent.Reconnecting, () => this.setStatus('reconnecting'));
    this.room.on(RoomEvent.Reconnected, () => this.setStatus('live'));
    this.room.on(RoomEvent.Disconnected, () => this.setStatus(this.closed ? 'closed' : 'failed'));
    this.room.on(
      RoomEvent.DataReceived,
      (payload: Uint8Array, from?: RemoteParticipant, _kind?: unknown, topic?: string) =>
        this.data(payload, from, topic),
    );
  }

  /* Reading */

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly snapshot = (): FireSnapshot => this.state;

  /** A person's loudness, 0 to 1, read on twos while they're by the fire. */
  levelOf(id: string): SharedValue<number> {
    let level = this.levels.get(id);
    if (!level) {
      level = makeMutable(0);
      this.levels.set(id, level);
    }
    return level;
  }

  /* Sitting down and heading home */

  /** Sits down, listening or joined in; both arrive muted. Answers whether it worked. */
  async sit(mode: FireMode): Promise<boolean> {
    this.setStatus('connecting');
    try {
      const { url, token } = await this.deps.token(mode);
      await AudioSession.startAudioSession();
      await this.room.connect(url, token, { autoSubscribe: true });
      if (this.closed) {
        await this.room.disconnect();
        return false;
      }
      this.levelTimer = setInterval(() => this.readLevels(), LEVEL_MS);
      this.setStatus('live');
      return true;
    } catch {
      this.setStatus('failed');
      await AudioSession.stopAudioSession().catch(() => undefined);
      return false;
    }
  }

  /** Heads home: the room closes on this phone, with no word to anyone. */
  async leave(): Promise<void> {
    this.closed = true;
    if (this.levelTimer !== null) clearInterval(this.levelTimer);
    for (const timer of this.weakTimers.values()) clearTimeout(timer);
    this.weakTimers.clear();
    await this.room.disconnect().catch(() => undefined);
    await AudioSession.stopAudioSession().catch(() => undefined);
    this.setStatus('closed');
  }

  /* Your voice, lantern and captions */

  /** Opens or closes your mic. Throws when the mic can't be used (no permission). */
  async setMic(on: boolean): Promise<void> {
    await this.room.localParticipant.setMicrophoneEnabled(on);
    this.queueRefresh();
  }

  /** A listener joins in: the API lets their seat publish, then their mic opens. */
  async joinIn(): Promise<void> {
    await this.deps.token('join');
    const local = this.room.localParticipant;
    if (!local.permissions?.canPublish) {
      await new Promise<void>((resolve) => {
        const done = () => {
          clearTimeout(timer);
          this.room.off(RoomEvent.ParticipantPermissionsChanged, check);
          resolve();
        };
        const check = () => {
          if (local.permissions?.canPublish) done();
        };
        const timer = setTimeout(done, 4000);
        this.room.on(RoomEvent.ParticipantPermissionsChanged, check);
      });
    }
    await this.setMic(true);
  }

  /** Lights or puts out your lantern (camera), and tells the room. */
  async setLantern(on: boolean): Promise<void> {
    await this.room.localParticipant.setCameraEnabled(on);
    if (!on) await this.setLook(false);
    await this.attributes({ lantern: on ? 'on' : 'off' });
    this.queueRefresh();
  }

  /** Turns your lantern round to show what's in front of you, or back to your face. */
  async setLook(away: boolean): Promise<void> {
    const pub = this.room.localParticipant.getTrackPublication(Track.Source.Camera);
    const track = pub?.track as LocalVideoTrack | undefined;
    if (track) await track.restartTrack({ facingMode: away ? 'environment' : 'user' });
    const local = this.room.localParticipant.identity;
    if (away) this.showing.add(local);
    else this.showing.delete(local);
    const data = new TextEncoder().encode(JSON.stringify({ away }));
    await this.room.localParticipant
      .publishData(data, { reliable: true, topic: LOOK_TOPIC })
      .catch(() => undefined);
    this.queueRefresh();
  }

  /** Turns captions on in a language, or off (null). Only you see them. */
  async setCaptionsIn(lang: LanguageTag | null): Promise<void> {
    await this.attributes({ captionsIn: lang ?? '' });
    if (lang === null) this.state = { ...this.state, captions: [] };
    this.queueRefresh();
  }

  /** A "…" for a speaker who said no to captions, while they talk. */
  withheld(speaker: string): void {
    this.state = {
      ...this.state,
      captions: addRow(this.state.captions, { kind: 'withheld', speaker }),
    };
    this.emit();
  }

  /* Inside */

  private async attributes(change: Record<string, string>): Promise<void> {
    const local = this.room.localParticipant;
    await local.setAttributes({ ...local.attributes, ...change }).catch(() => undefined);
  }

  private data(payload: Uint8Array, from: RemoteParticipant | undefined, topic?: string): void {
    if (topic === FIRE_CAPTION_TOPIC) {
      const line = lineFrom(payload);
      if (line === null) return;
      this.state = { ...this.state, captions: addRow(this.state.captions, { kind: 'line', line }) };
      this.emit();
      return;
    }
    if (topic === LOOK_TOPIC && from) {
      try {
        const { away } = JSON.parse(new TextDecoder().decode(payload)) as { away?: unknown };
        if (away === true) this.showing.add(from.identity);
        else this.showing.delete(from.identity);
        this.queueRefresh();
      } catch {
        // Not a look message; nothing to show.
      }
    }
  }

  private quality(p: Participant, q: ConnectionQuality): void {
    const id = p.identity;
    const poor = q === ConnectionQuality.Poor || q === ConnectionQuality.Lost;
    if (poor && !this.poorSince.has(id)) {
      this.poorSince.set(id, Date.now());
      this.weakTimers.set(
        id,
        setTimeout(() => this.queueRefresh(), WEAK_AFTER_MS + 50),
      );
    } else if (!poor) {
      this.poorSince.delete(id);
      const timer = this.weakTimers.get(id);
      if (timer) clearTimeout(timer);
      this.weakTimers.delete(id);
    }
    this.queueRefresh();
  }

  private isWeak(id: string): boolean {
    const since = this.poorSince.get(id);
    return since !== undefined && Date.now() - since >= WEAK_AFTER_MS;
  }

  private readLevels(): void {
    const all: Participant[] = [
      this.room.localParticipant,
      ...this.room.remoteParticipants.values(),
    ];
    let loudest = 0;
    for (const p of all) {
      const level = this.levelOf(p.identity);
      const heard = this.isWeak(p.identity) ? 0 : p.isSpeaking ? p.audioLevel : 0;
      level.set(heard);
      loudest = Math.max(loudest, heard);
    }
    this.loudest.set(loudest);
  }

  private queueRefresh(): void {
    if (this.refreshQueued) return;
    this.refreshQueued = true;
    requestAnimationFrame(() => {
      this.refreshQueued = false;
      this.refresh();
    });
  }

  private refresh(): void {
    const local = this.room.localParticipant;
    const connected = this.state.status === 'live' || this.state.status === 'reconnecting';
    const all: Participant[] = connected ? [local, ...this.room.remoteParticipants.values()] : [];
    const people = bySitting(
      all.map((p) => {
        const weak = p !== local && this.isWeak(p.identity);
        if (p !== local) this.pauseIfWeak(p as RemoteParticipant, weak);
        const mode: FireMode = p.attributes['mode'] === 'listen' ? 'listen' : 'join';
        return {
          id: p.identity,
          you: p === local,
          mode: p === local && !local.permissions?.canPublish ? 'listen' : mode,
          mic: p.isMicrophoneEnabled,
          speaking: p.isSpeaking && !weak,
          weak,
          lantern: p.isCameraEnabled,
          sharing: p.isScreenShareEnabled,
          captionsOk: p.attributes['captionsOk'] === 'yes',
          joinedAt: p.joinedAt?.getTime() ?? Number.MAX_SAFE_INTEGER,
        } satisfies FirePerson;
      }),
    );
    const here = new Set(people.map((p) => p.id));
    const showing = [...this.showing].find((id) => here.has(id)) ?? null;
    const captioning = all.some((p) => (p.attributes['captionsIn'] ?? '') !== '');
    this.state = { ...this.state, people, showing, captioning };
    this.emit();
  }

  /** A weak connection's audio is paused rather than garbled; it plays again once it's back. */
  private pauseIfWeak(p: RemoteParticipant, weak: boolean): void {
    if (weak === this.paused.has(p.identity)) return;
    const mic = p.getTrackPublication(Track.Source.Microphone);
    if (!mic) return;
    mic.setEnabled(!weak);
    if (weak) this.paused.add(p.identity);
    else this.paused.delete(p.identity);
  }

  private setStatus(status: SessionStatus): void {
    this.state = { ...this.state, status };
    this.refresh();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
