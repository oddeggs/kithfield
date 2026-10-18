import type { View } from 'react-native';
import { makeMutable, type AnimatedRef, type SharedValue } from 'react-native-reanimated';

import type { Box } from './geometry';
import type { SpriteSpec } from './sprite';

/** A registered source or target of travelling art, by the id both ends agree on. */
export type AnchorId = string;

export interface AnchorEntry {
  /** 1 while the anchor's own drawing shows; travel sets 0 while its copy is in the air. */
  readonly shown: SharedValue<number>;
  /** The view to measure, once something with this id is on screen. */
  ref: AnimatedRef<View> | null;
  /** Where it last laid out on the window, if it has. */
  box: Box | null;
  /** What it looks like, for a flight that leaves from it or becomes it on landing. */
  sprite: SpriteSpec | undefined;
  /** Flights and drawings using this entry: it is kept while any is. */
  holds: number;
}

/**
 * The anchors on screen, by id. Sources and targets register here as they mount; a flight finds
 * them by id, measures them on the UI thread and hides or reveals their drawing. An id may be
 * asked for before anything with it mounts (a target on a screen still opening): its entry is
 * made then, and listeners hear when it arrives.
 */
export class AnchorRegistry {
  private readonly entries = new Map<AnchorId, AnchorEntry>();
  private readonly listeners = new Set<() => void>();

  /** The entry for `id`, if anything holds it. */
  peek(id: AnchorId): AnchorEntry | undefined {
    return this.entries.get(id);
  }

  /** The entry for `id`, kept until `release`. */
  hold(id: AnchorId): AnchorEntry {
    let entry = this.entries.get(id);
    if (!entry) {
      entry = { shown: makeMutable(1), ref: null, box: null, sprite: undefined, holds: 0 };
      this.entries.set(id, entry);
    }
    entry.holds += 1;
    return entry;
  }

  release(id: AnchorId): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    entry.holds = Math.max(0, entry.holds - 1);
    if (entry.holds === 0 && entry.ref === null) this.entries.delete(id);
  }

  /** Puts `ref` under `id`; the returned function takes it away again. */
  attach(id: AnchorId, ref: AnimatedRef<View>): () => void {
    const entry = this.hold(id);
    entry.ref = ref;
    this.changed();
    return () => {
      if (entry.ref === ref) {
        entry.ref = null;
        entry.sprite = undefined;
        entry.box = null;
        // Whatever was hidden for a flight shows again if it comes back.
        entry.shown.set(1);
      }
      this.release(id);
      this.changed();
    };
  }

  /** Whether something with `id` is on screen now (mounted and laid out somewhere). */
  has(id: AnchorId): boolean {
    return this.entries.get(id)?.ref != null;
  }

  /** Hears every anchor that arrives or leaves. */
  listen(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private changed() {
    for (const listener of this.listeners) listener();
  }
}
