import * as FileSystem from 'expo-file-system/legacy';
import { useEffect, useSyncExternalStore } from 'react';

import { markSeen, seenTo, type SeenMarks } from '../model/seen';

/*
 * How far this phone has looked at each chat, in a small file on this phone only. It is never
 * sent to the server or anyone else: it only lights and clears the honey dot, so nobody can tell
 * whether a message was read.
 */

const FILE = `${FileSystem.documentDirectory ?? ''}chat-seen.json`;

let marks: SeenMarks = {};
let loaded = false;
let saving: Promise<void> = Promise.resolve();
const listeners = new Set<() => void>();

const notify = () => {
  for (const listener of listeners) listener();
};

async function load(): Promise<void> {
  if (loaded) return;
  loaded = true;
  try {
    const text = await FileSystem.readAsStringAsync(FILE);
    const parsed = JSON.parse(text) as unknown;
    if (typeof parsed === 'object' && parsed !== null) {
      // Marks set while the file was being read win; the file only fills in the rest.
      let next = marks;
      for (const [farm, seq] of Object.entries(parsed)) {
        if (typeof seq === 'number') next = markSeen(next, farm, seq);
      }
      marks = next;
      notify();
    }
  } catch {
    // No file yet, or one this version can't read: start from nothing.
  }
}

/** Notes that this phone has shown a farm's chat up to `seq`. */
export function noteSeen(farm: string, seq: number): void {
  const next = markSeen(marks, farm, seq);
  if (next === marks) return;
  marks = next;
  notify();
  const snapshot = JSON.stringify(marks);
  saving = saving.then(() => FileSystem.writeAsStringAsync(FILE, snapshot).catch(() => undefined));
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** The last seq this phone has shown of a farm's chat; 0 for never. */
export function useSeenTo(farm: string): number {
  useEffect(() => {
    void load();
  }, []);
  return useSyncExternalStore(subscribe, () => seenTo(marks, farm));
}
