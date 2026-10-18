import type { FarmId, FarmList, FarmState } from '@kithfield/contracts';
import { farmView } from '@kithfield/farm';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useCottage, useDataClient } from '../../data';
import { bringUpToDate } from './bed-sync';
import { bedKindOf, planDay, sortBed, stageOf, stillGrowing, type BedEntry } from './plan-status';
import { useNow } from './use-plans';

type FarmItem = FarmList['farms'][number];

export interface BedFarm {
  readonly farm: FarmId;
  readonly kind: FarmItem['kind'];
  /** The farm's name, or the friend's for a visit. */
  readonly name: string | null;
}

const fromChats = (chats: ReturnType<typeof useCottage>['chats']): BedFarm[] =>
  chats.map((c) => ({ farm: c.farm, kind: c.farmKind, name: c.name ?? c.with?.name ?? null }));

/**
 * The farms and visits this person lives on: null until known. Asked of the server each time the
 * seed bed comes into view and when the chat list gains or loses a farm; offline, the farms the
 * phone holds from the chat list stand in.
 */
export function useBedFarms(): readonly BedFarm[] | null {
  const client = useDataClient();
  const { chats } = useCottage();
  const [farms, setFarms] = useState<readonly BedFarm[] | null>(null);
  const held = useRef(chats);
  held.current = chats;
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
      () => live && setFarms((prev) => prev ?? fromChats(held.current)),
    );
    return () => {
      live = false;
    };
  }, [client]);
  // On coming into view (the first time included), then only when the chat list's farms change.
  useFocusEffect(loadFarms);
  const firstKey = useRef(chatKey);
  useEffect(() => {
    if (chatKey === firstKey.current) return;
    firstKey.current = chatKey;
    return loadFarms();
  }, [chatKey, loadFarms]);
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
      });
    }
    return () => {
      live = false;
      for (const off of offs) off();
    };
    // `farmKey` stands for the list of farms.
  }, [client, farmKey]);

  // Each time the seed bed comes into view, the farms are brought up to date.
  useFocusEffect(
    useCallback(() => {
      let wanted = true;
      const list = farmKey === '' ? [] : farmKey.split(',');
      void bringUpToDate(client, list, { stillWanted: () => wanted });
      return () => {
        wanted = false;
      };
    }, [client, farmKey]),
  );

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
