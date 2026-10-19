import type { AudioKind, AudioRoute } from '../../../modules/surfaces';

/*
 * Where the fire sounds (`10 On the System`, AirPods and audio routing): the places the room can
 * play, as the sheet lists them, and what a change of route means for the mic.
 */

export interface RouteRow {
  /** What `setAudioRoute` takes; `airplay` opens the system's picker. */
  readonly id: string;
  readonly kind: AudioKind;
  /** A headset's own name ("June's AirPods"); empty for the phone's own. */
  readonly name: string;
  readonly current: boolean;
}

/** Headsets first, then the earpiece, the speaker, and other places to listen. */
export function routeRows(route: AudioRoute): RouteRow[] {
  const out = route.output.kind;
  const rows = route.options.map((o) => ({
    id: o.id,
    kind: o.kind,
    name: o.name,
    current:
      o.kind === out &&
      (o.kind === 'iphone' || o.kind === 'speaker' || o.name === route.output.name),
  }));
  const airplay =
    out === 'airplay'
      ? { id: 'airplay', kind: 'airplay' as const, name: route.output.name, current: true }
      : { id: 'airplay', kind: 'airplay' as const, name: '', current: false };
  return [...rows, airplay];
}

/** A headset just went (an AirPod taken out): the mic pauses, the room keeps going. */
export const headsetGone = (event: AudioRoute & { reason: string }, before: AudioKind | null) =>
  event.reason === 'gone' && (before === 'bluetooth' || before === 'wired');
