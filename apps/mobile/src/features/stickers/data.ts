import type { Collection, Critter } from '@kithfield/contracts';
import { useCallback, useEffect, useState } from 'react';

import { useDataClient } from '../../data';
import { useSession } from '../../ui/session/session';
import { stickersApi } from './api';
import { personFile } from './local-files';
import { pushRecent, type RecentSticker } from './model/recents';

export type { RecentSticker } from './model/recents';

/*
 * What the sticker screens read from the server, kept for the session so a sheet opens with what
 * it showed last time and refreshes behind it.
 */

let collectionHeld: Collection | null = null;
const collectionListeners = new Set<(c: Collection) => void>();

/**
 * The person's collection (the packs they own among it). Null until it first loads, and while the
 * shop's server can't be reached: the free pack needs nothing from it.
 */
export function useCollection(): {
  readonly collection: Collection | null;
  readonly reload: () => void;
} {
  const client = useDataClient();
  const [collection, setCollection] = useState<Collection | null>(collectionHeld);
  const reload = useCallback(() => {
    stickersApi(client.api)
      .collection()
      .then(
        (c) => {
          collectionHeld = c;
          for (const l of collectionListeners) l(c);
        },
        () => undefined,
      );
  }, [client]);
  useEffect(() => {
    collectionListeners.add(setCollection);
    reload();
    return () => {
      collectionListeners.delete(setCollection);
    };
  }, [reload]);
  return { collection, reload };
}

/** Who on this farm can be drawn into a together sticker; null until the server answers. */
export function useTogetherPeople(farm: string): readonly string[] | null {
  const client = useDataClient();
  const [people, setPeople] = useState<readonly string[] | null>(null);
  useEffect(() => {
    let live = true;
    stickersApi(client.api)
      .together(farm)
      .then(
        (r) => live && setPeople(r.people),
        () => live && setPeople([]),
      );
    return () => {
      live = false;
    };
  }, [client, farm]);
  return people;
}

/* Recent stickers */

/** The recent row, the person's own, per farm (together stickers name that farm's friends). */
export function useRecents(farm: string): {
  readonly recents: readonly RecentSticker[];
  readonly add: (sent: RecentSticker) => void;
} {
  const { person } = useSession();
  const id = person?.id ?? null;
  const [all, setAll] = useState<Record<string, RecentSticker[]>>({});
  useEffect(() => {
    setAll({});
    if (id === null) return;
    let live = true;
    void readRecents(id).then((r) => live && setAll(r));
    return () => {
      live = false;
    };
  }, [id]);
  const add = useCallback(
    (sent: RecentSticker) => {
      setAll((prev) => {
        const next = { ...prev, [farm]: pushRecent(prev[farm] ?? [], sent) };
        // The row is a nicety: losing it loses nothing sent.
        if (id !== null) {
          void personFile('recent', id)
            .write(JSON.stringify(next))
            .catch(() => undefined);
        }
        return next;
      });
    },
    [farm, id],
  );
  return { recents: all[farm] ?? [], add };
}

async function readRecents(person: string): Promise<Record<string, RecentSticker[]>> {
  try {
    const file = personFile('recent', person);
    if (!file.exists) return {};
    const parsed = JSON.parse(await file.text()) as unknown;
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, RecentSticker[]>)
      : {};
  } catch {
    return {};
  }
}

/** A friend a pack can be given to, and the farm it would wait on. */
export interface GiftFriend {
  readonly person: string;
  readonly name: string | null;
  readonly critter: Critter;
  readonly farm: string;
}

/**
 * Who a pack can go to: the people on `farm`, or, with no farm, everyone on the person's farms
 * (each once, on the first farm they share), in the order they moved in.
 */
export function useGiftFriends(
  farm: string | null,
  me: string | null,
): readonly GiftFriend[] | null {
  const client = useDataClient();
  const [friends, setFriends] = useState<readonly GiftFriend[] | null>(null);
  useEffect(() => {
    if (me === null) return;
    let live = true;
    const load = async () => {
      const farms = farm !== null ? [farm] : (await client.api.farms()).farms.map((f) => f.farm);
      const found: GiftFriend[] = [];
      const seen = new Set<string>([me]);
      for (const f of farms) {
        const state = (await client.replica(f)).getState().state;
        const members = [...(state?.members ?? [])].sort((a, b) => a.joinedAt - b.joinedAt);
        for (const m of members) {
          if (seen.has(m.person)) continue;
          seen.add(m.person);
          found.push({ person: m.person, name: m.name, critter: m.critter, farm: f });
        }
      }
      return found;
    };
    load().then(
      (f) => live && setFriends(f),
      () => live && setFriends([]),
    );
    return () => {
      live = false;
    };
  }, [client, farm, me]);
  return friends;
}
