import type { FarmId, FarmState } from '@kithfield/contracts';
import type { Href } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import { useFarm } from '../../data';
import { useSession } from '../../ui/session/session';
import { useFarmFlags } from '../farm/valley-store';
import { harvestToShow, parseSeen, rareBloomToShow, seenWith } from './moments';
import { fieldGuideRoutes } from './routes';

/*
 * When the field guide's moments show, from the phone's own flags: a rare bloom once per bloom
 * and harvest day once per season, for this person on this phone. The farm home asks; the
 * moment's own screen marks it seen when it shows.
 */

const RARE_FLAG = 'field-guide-rare';
const HARVEST_FLAG = 'field-guide-harvest';

/** Flags written on this phone, so every hook reading them reads again. */
const changed = new Set<() => void>();
const announce = () => changed.forEach((l) => l());

/** A flag's value, or undefined while it is read. */
function useFlag(farm: FarmId, flag: string): string | null | undefined {
  const { read } = useFarmFlags(farm);
  const [value, setValue] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    const load = () => {
      void read(flag).then((v) => {
        if (live) setValue(v);
      });
    };
    load();
    changed.add(load);
    return () => {
      live = false;
      changed.delete(load);
    };
  }, [read, flag]);
  return value;
}

/**
 * The rare bloom moment to open as the farm shows, or null: a rare bloom from this season this
 * person hasn't seen on this phone. Push it with `router.push(href)`.
 */
export function useRareBloomMoment(farm: FarmId): Href | null {
  const me = useSession().person?.id ?? null;
  const state = useFarm(farm)?.state ?? null;
  const seen = useFlag(farm, RARE_FLAG);
  if (!state || !me || seen === undefined) return null;
  const bloom = rareBloomToShow(state, me, parseSeen(seen));
  return bloom ? fieldGuideRoutes.rareBloom(farm, bloom.key) : null;
}

/**
 * Harvest day's moment to open as the farm shows, or null: the season's basket, once per season
 * for this person on this phone. Push it with `router.push(href)`.
 */
export function useHarvestMoment(farm: FarmId): Href | null {
  const me = useSession().person?.id ?? null;
  const state = useFarm(farm)?.state ?? null;
  const seen = useFlag(farm, HARVEST_FLAG);
  if (!state || !me || seen === undefined) return null;
  return harvestToShow(state, me, seen) ? fieldGuideRoutes.harvest(farm) : null;
}

/** Marks a rare bloom seen on this phone. */
export function useMarkRareSeen(farm: FarmId): (state: FarmState, key: string) => Promise<void> {
  const { read, write } = useFarmFlags(farm);
  return useCallback(
    async (state, key) => {
      const seen = parseSeen(await read(RARE_FLAG));
      if (seen.includes(key)) return;
      await write(RARE_FLAG, JSON.stringify(seenWith(state, seen, key)));
      announce();
    },
    [read, write],
  );
}

/** Marks a season's harvest seen on this phone. */
export function useMarkHarvestSeen(farm: FarmId): (season: string) => Promise<void> {
  const { write } = useFarmFlags(farm);
  return useCallback(
    async (season) => {
      await write(HARVEST_FLAG, season);
      announce();
    },
    [write],
  );
}
