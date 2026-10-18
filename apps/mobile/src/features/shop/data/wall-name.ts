import type { FarmersWall } from '@kithfield/contracts';
import { useEffect, useState } from 'react';

import { useShop } from './shop-data';

/*
 * The name the person shows on the farmers' wall: their entitlements say it, and the one put up
 * or taken down in this run counts until the entitlements are read again.
 */

let putUp: { person: string; name: string | null } | null = null;

/** Remembers the name just put up (or taken down) on the wall. */
export function rememberWallName(person: string, name: string | null): void {
  putUp = { person, name };
}

export interface MyWallName {
  /** The first page of the wall, once loaded. */
  readonly wall: FarmersWall | null;
  /** The person's own name on it, as far as the phone knows. */
  readonly name: string | null;
  /** The names either side of it, on this page. */
  readonly before: string | null;
  readonly after: string | null;
}

/** The person's place on the wall, from the wall's first page. */
export function useMyWallName(): MyWallName {
  const shop = useShop();
  const [wall, setWall] = useState<FarmersWall | null>(null);
  useEffect(() => {
    let live = true;
    shop.api.wall().then(
      (w) => live && setWall(w),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [shop.api]);
  const known = putUp?.person === shop.person ? putUp.name : undefined;
  const name = known === undefined ? (shop.entitlements?.wallName ?? null) : known;
  const names = (wall?.names ?? []).map((n) => n.name);
  const at = name === null ? -1 : names.indexOf(name);
  return {
    wall,
    name,
    before: at > 0 ? (names[at - 1] ?? null) : null,
    after: at >= 0 ? (names[at + 1] ?? null) : null,
  };
}
