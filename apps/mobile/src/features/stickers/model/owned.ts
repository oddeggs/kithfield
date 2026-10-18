import type { Collection, FarmState, OwnedVia, SeasonRef } from '@kithfield/contracts';
import { localDay, seasonOf } from '@kithfield/farm';

import { allPacks, OWN, type PackDef } from './catalogue';

/** A pack the person can send from, and how it came to be theirs. */
export interface OwnedPack {
  readonly pack: PackDef;
  /** `free` for everyone's own pack. */
  readonly via: OwnedVia | 'free';
  /** Who gave it, for a gift. */
  readonly from: string | null;
  /** When it became theirs; null for the free pack. */
  readonly at: number | null;
}

/**
 * The packs someone can send from: their own, always first, then the packs they own in the order
 * they got them. A pack the server lists that this app can't draw yet is left out.
 */
export function ownedPacks(collection: Collection | null): OwnedPack[] {
  const own = allPacks().find((p) => p.id === OWN);
  const packs: OwnedPack[] = own ? [{ pack: own, via: 'free', from: null, at: null }] : [];
  if (collection === null) return packs;
  const byId = new Map(allPacks().map((p) => [p.id as string, p]));
  const seen = new Set<string>([OWN]);
  const items = [...collection.items].sort((a, b) => a.at - b.at);
  for (const item of items) {
    const pack = byId.get(item.item);
    if (!pack || seen.has(pack.id)) continue;
    seen.add(pack.id);
    packs.push({ pack, via: item.via, from: item.from, at: item.at });
  }
  return packs;
}

/** Whether the person owns a pack (their own always). */
export function ownsPack(collection: Collection | null, pack: string): boolean {
  return pack === OWN || (collection?.items.some((i) => i.item === pack) ?? false);
}

/** How a pack's tab says where it came from. */
export type PackHint =
  | { readonly kind: 'mine' }
  | { readonly kind: 'gift'; readonly from: string }
  | { readonly kind: 'bought'; readonly season: SeasonRef['season'] }
  | { readonly kind: 'yours' };

/** The season it became theirs, in the farm's own seasons, or a plain "yours". */
export function packHint(
  owned: OwnedPack,
  farm: Pick<FarmState, 'timeZone' | 'hemisphere'> | null,
): PackHint {
  if (owned.via === 'free') return { kind: 'mine' };
  if (owned.via === 'gift' && owned.from) return { kind: 'gift', from: owned.from };
  if (owned.at !== null && farm !== null) {
    try {
      return {
        kind: 'bought',
        season: seasonOf(localDay(owned.at, farm.timeZone), farm.hemisphere).season,
      };
    } catch {
      return { kind: 'yours' };
    }
  }
  return { kind: 'yours' };
}
