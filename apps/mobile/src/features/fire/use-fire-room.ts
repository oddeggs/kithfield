import type { FarmId, FarmState, PersonId } from '@kithfield/contracts';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { usePresence, type PresenceState } from '../../data';
import { useAppActive } from '../../ui/motion/visibility';
import { CaptionSender } from './caption-sender';
import type { FireApi } from './fire-api';
import { FireSession, type FireSnapshot } from './fire-session';
import { captionsWanted } from './room-model';

/*
 * The fire room for a screen: one sitting (a LiveKit room) held while the screen is open and left
 * quietly when it closes, and your voice sent for captions only while it should be.
 */

/**
 * Who is by the fire, from the farm socket's `presence` frame. Older data layers leave `fire` out
 * of the presence they keep; they read as nobody.
 */
export function useFireCircle(farm: FarmId): readonly PersonId[] {
  const presence: PresenceState & { readonly fire?: readonly PersonId[] } = usePresence(farm);
  return presence.fire ?? NOBODY;
}

const NOBODY: readonly PersonId[] = [];

/** A person's name and critter on the farm, through its aliases; "a friend" when unknown. */
export function memberOf(state: FarmState | null, id: string) {
  if (state === null) return null;
  const person = state.aliases[id] ?? id;
  return state.members.find((m) => m.person === person) ?? null;
}

export interface FireRoom {
  readonly session: FireSession;
  readonly snap: FireSnapshot;
}

/** The sitting for this screen, left when it closes. Captions follow `captionsOk` and the room. */
export function useFireRoom(farm: FarmId, api: FireApi, captionsOk: boolean): FireRoom {
  const [session] = useState(() => new FireSession(farm, { token: api.token }));
  useEffect(
    () => () => {
      void session.leave();
    },
    [session],
  );
  const snap = useSyncExternalStore(session.subscribe, session.snapshot);

  // Your voice goes for captions only while you said yes, your mic is open, someone by the fire
  // has captions on, and the app is in front. When the API says nobody is listening any more, it
  // waits for the room to change.
  const active = useAppActive();
  const you = snap.people.find((p) => p.you);
  const micOpen = you?.mic === true;
  const roomKey = `${snap.captioning}:${snap.people.map((p) => p.id).join()}`;
  const keyNow = useRef(roomKey);
  useEffect(() => {
    keyNow.current = roomKey;
  }, [roomKey]);
  const [quietFor, setQuietFor] = useState<string | null>(null);
  const [sender] = useState(
    () => new CaptionSender(session.room, api.sendPiece, () => setQuietFor(keyNow.current)),
  );
  const wanted = captionsWanted({
    available: snap.captionsAvailable,
    captionsOk,
    micOpen,
    captioning: snap.captioning,
    live: snap.status === 'live',
    quiet: quietFor === roomKey,
    active,
  });
  useEffect(() => {
    if (wanted && !sender.running) sender.start();
    if (!wanted && sender.running) sender.stop();
    // LiveKit replaces the mic's track as it is muted and unmuted, or the route changes.
    if (wanted) sender.follow(session.micTrackId());
  }, [wanted, sender, session, snap.people]);
  // Coming back from the background (or a call, or Siri): read the mic's state again.
  useEffect(() => {
    if (active) session.resync();
  }, [active, session]);
  useEffect(() => () => sender.stop(), [sender]);

  return { session, snap };
}
