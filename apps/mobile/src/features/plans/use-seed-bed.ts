import type { FarmId, FarmList, FarmState } from '@kithfield/contracts';
import { farmView } from '@kithfield/farm';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useCottage, useDataClient, type DataClient } from '../../data';
import { bedKindOf, planDay, sortBed, stageOf, stillGrowing, type BedEntry } from './plan-status';
import { useNow } from './use-plans';

type FarmItem = FarmList['farms'][number];

export interface BedFarm {
  readonly farm: FarmId;
  readonly kind: FarmItem['kind'];
  /** The farm's name, or the friend's for a visit. */
  readonly name: string | null;
}

/** Pages a farm's log in over HTTP, at most this many pages a visit to the seed bed. */
const CATCH_UP_PAGES = 10;
const PAGE = 200;

/**
 * Brings a farm the phone isn't holding open up to date over HTTP, so the seed bed shows every
 * farm's plans without opening each farm's socket. Pages apply exactly as socket batches do.
 */
async function catchUp(client: DataClient, farm: FarmId): Promise<void> {
  const replica = await client.replica(farm);
  for (let page = 0; page < CATCH_UP_PAGES; page += 1) {
    const { lastSeq } = replica.getState();
    const { events, more } = await client.api.events(farm, { after: lastSeq, limit: PAGE });
    if (events.length === 0) return;
    await replica.applyPage(events);
    if (!more || replica.getState().lastSeq === lastSeq) return;
  }
}

/** The farms and visits this person lives on: null until the first answer. */
export function useBedFarms(): readonly BedFarm[] | null {
  const client = useDataClient();
  const { chats } = useCottage();
  const [farms, setFarms] = useState<readonly BedFarm[] | null>(null);
  const chatKey = chats
    .map((c) => c.farm)
    .sort()
    .join(',');
  const loadFarms = useCallback(() => {
    let live = true;
    client.api.farms().then(
      (list) =>
        live &&
        setFarms(
          list.farms.map((f) => ({ farm: f.farm, kind: f.kind, name: f.name ?? f.with?.name ?? null })),
        ),
      // Offline: keep showing what the phone holds.
      () => live && setFarms((prev) => prev ?? []),
    );
    return () => {
      live = false;
    };
  }, [client]);
  useFocusEffect(loadFarms);
  useEffect(loadFarms, [loadFarms, chatKey]);

  return farms;
}

/**
 * Every plan across the person's farms and visits, sorted as the seed bed shows them: sprouted,
 * growing, needing something, then resting "someday" seeds. Unsent plans are never drawn.
 */
export function useSeedBed(): {
  readonly entries: readonly BedEntry[];
  readonly farms: readonly BedFarm[];
  /** Each farm as the phone holds it, for the people on its plans. */
  readonly states: ReadonlyMap<FarmId, FarmState>;
  readonly loading: boolean;
} {
  const client = useDataClient();
  const now = useNow();
  const farms = useBedFarms();
  const [states, setStates] = useState<ReadonlyMap<FarmId, FarmState>>(new Map());
  const caught = useRef(new Set<FarmId>());

  const farmKey = (farms ?? []).map((f) => f.farm).join(',');
  useEffect(() => {
    const offs: (() => void)[] = [];
    let live = true;
    for (const { farm } of farms ?? []) {
      void client.replica(farm).then((replica) => {
        if (!live) return;
        const read = () => {
          const state = replica.getState().state;
          setStates((prev) => {
            if (!state || prev.get(farm) === state) return prev;
            return new Map(prev).set(farm, state);
          });
        };
        read();
        offs.push(replica.subscribe(read));
        if (!caught.current.has(farm)) {
          caught.current.add(farm);
          catchUp(client, farm).catch(() => caught.current.delete(farm));
        }
      });
    }
    return () => {
      live = false;
      for (const off of offs) off();
    };
    // `farmKey` stands for the list of farms.
  }, [client, farmKey]);

  const entries = useMemo(() => {
    const list: BedEntry[] = [];
    for (const f of farms ?? []) {
      const state = states.get(f.farm);
      if (!state) continue;
      const view = farmView(state, now);
      for (const plan of view.plans) {
        const entry: BedEntry = {
          farm: f.farm,
          farmName: f.name,
          timeZone: state.timeZone,
          seed: plan.seed,
          stage: stageOf(plan.seed, plan.conditions),
          kind: bedKindOf(plan.seed, plan.conditions, view.today),
          day: planDay(plan.seed),
          conditions: plan.conditions,
        };
        if (stillGrowing(entry, view.today)) list.push(entry);
      }
    }
    return sortBed(list);
  }, [farms, states, now]);

  return { entries, farms: farms ?? [], states, loading: farms === null };
}
