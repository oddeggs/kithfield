import type { ChipIn, FarmId, StoreProductId } from '@kithfield/contracts';
import { useCallback, useEffect, useState } from 'react';

import { useShop } from '../data/shop-data';

/**
 * The farm's open chip-ins the person may see, and the tiers a pledge is made in (cheapest
 * first). `put` replaces one with the server's newer answer after a pledge.
 */
export function useChipIns(farm: FarmId): {
  readonly chipIns: readonly ChipIn[] | null;
  readonly tiers: readonly StoreProductId[];
  readonly failed: boolean;
  readonly put: (next: ChipIn) => void;
} {
  const { api } = useShop();
  const [chipIns, setChipIns] = useState<readonly ChipIn[] | null>(null);
  const [tiers, setTiers] = useState<readonly StoreProductId[]>([]);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    api.chipIns(farm).then(
      (list) => live && setChipIns(list.chipIns),
      () => live && setFailed(true),
    );
    api.chipInOffer().then(
      (offer) => live && setTiers(offer.tiers),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [api, farm]);
  const put = useCallback((next: ChipIn) => {
    setChipIns((all) => [next, ...(all ?? []).filter((c) => c.chipIn !== next.chipIn)]);
  }, []);
  return { chipIns, tiers, failed, put };
}
