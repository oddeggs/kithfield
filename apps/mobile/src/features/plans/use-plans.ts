import type { FarmId, FarmState, PersonId, Seq } from '@kithfield/contracts';
import type { FarmView, PlanView } from '@kithfield/farm';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';

import {
  useDataClient,
  useFarm,
  useFarmView,
  useRejections,
  useSend,
  type EnqueueResult,
} from '../../data';
import { useToast } from '../../ui/components/toast';
import { useLocale } from '../../ui/locale/locale-provider';
import { useSession } from '../../ui/session/session';
import { settlePlanted } from './planted';
import { filePlantedStore } from './planted-file';

/** The signed-in person's id, or null. */
export function useMe(): PersonId | null {
  return useSession().person?.id ?? null;
}

const MINUTE = 60_000;

/** "Now", moving on each minute and whenever the app comes back, for day rules and sleepiness. */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), MINUTE);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && setNow(Date.now()));
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, []);
  return now;
}

export interface PlanOnFarm {
  readonly state: FarmState;
  readonly view: FarmView;
  readonly plan: PlanView | null;
}

/**
 * One plan on one farm, as the shared rules see it now. `plan` is null when the seed isn't on
 * the farm (not caught up yet, or unsent: an unsent plan is never drawn).
 */
export function usePlan(farm: FarmId, seq: Seq | null): PlanOnFarm | null {
  const now = useNow();
  const state = useFarm(farm)?.state ?? null;
  const view = useFarmView<FarmView>(farm, now);
  return useMemo(() => {
    if (!state || !view) return null;
    const plan = seq === null ? null : (view.plans.find((p) => p.seed.seq === seq) ?? null);
    return { state, view, plan };
  }, [state, view, seq]);
}

/** Every kind a plan writes. */
export const PLAN_KINDS: readonly string[] = [
  'seed_planted',
  'seed_changed',
  'vote',
  'rsvp',
  'checkin',
];

/**
 * Makes a plan write on a farm. A write the shared rules already refuse, and one the farm turns
 * down later, are explained with a gentle toast instead of failing quietly.
 */
export function usePlanSend(farm: FarmId): (kind: string, payload: unknown) => Promise<boolean> {
  const send = useSend(farm);
  const { show } = useToast();
  const { t } = useLocale();
  return useCallback(
    async (kind, payload) => {
      let result: EnqueueResult;
      try {
        result = await send(kind, payload);
      } catch {
        show(t('plans.refused'));
        return false;
      }
      if (result.status === 'refused') show(t('plans.refused'));
      return result.status === 'queued';
    },
    [send, show, t],
  );
}

/** Explains plan writes the farm turned down, once each, while a plan screen is open. */
export function usePlanRejections(): void {
  const rejections = useRejections();
  const client = useDataClient();
  const { show } = useToast();
  const { t } = useLocale();
  useEffect(() => {
    const ours = rejections.filter((r) => PLAN_KINDS.includes(r.kind));
    if (ours.length === 0) return;
    show(t('plans.refused'));
    for (const r of ours) void client.dismissRejection(r.opId);
  }, [rejections, client, show, t]);
}

/** The plantings waiting for the planter's "in", kept on the phone. */
export const plantedStore = filePlantedStore();

/**
 * Says the planter's "in" for their plans once the farm has numbered them: on opening, and
 * whenever a farm with a planting waiting changes. Mounted wherever plans are planted or shown.
 */
export function usePlantedAnswers(): void {
  const client = useDataClient();
  const me = useMe();
  useEffect(() => {
    if (me === null) return;
    let live = true;
    const offs: (() => void)[] = [];
    const settle = () => {
      if (live) void settlePlanted(client, plantedStore, me).catch(() => undefined);
    };
    void plantedStore.read().then(async (planted) => {
      for (const farm of new Set(planted.filter((p) => p.person === me).map((p) => p.farm))) {
        const replica = await client.replica(farm);
        if (live) offs.push(replica.subscribe(settle));
      }
      settle();
    });
    return () => {
      live = false;
      for (const off of offs) off();
    };
  }, [client, me]);
}
