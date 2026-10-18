import type { FarmId, FarmState, PersonId, SeedPlantedPayload, Seq } from '@kithfield/contracts';
import type { FarmView, PlanView } from '@kithfield/farm';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';

import {
  useDataClient,
  useFarm,
  useFarmView,
  useRejections,
  useSend,
  type DataClient,
  type EnqueueResult,
} from '../../data';
import { useToast } from '../../ui/components/toast';
import { useLocale } from '../../ui/locale/locale-provider';
import { useSession } from '../../ui/session/session';

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

/** How long a planter waits for the farm to number a new plan before saying they're in. */
const PLANTED_WAIT_MS = 5 * MINUTE;

/**
 * Plants a plan and then says the planter is in. An answer needs the plan's seq, which only the
 * farm gives, so the "in" goes once the new seed shows up in the confirmed farm.
 */
export async function plantAndJoin(
  client: DataClient,
  farm: FarmId,
  me: PersonId,
  payload: SeedPlantedPayload,
): Promise<EnqueueResult> {
  const replica = await client.replica(farm);
  const known = new Set(replica.getState().confirmed?.seeds.map((s) => s.seq) ?? []);
  const result = await client.send(farm, 'seed_planted', payload);
  if (result.status !== 'queued') return result;
  const find = () =>
    replica
      .getState()
      .confirmed?.seeds.find(
        (s) => !known.has(s.seq) && s.planter === me && s.title === payload.title,
      );
  // In the background: the sheet closes at once, and the answer follows when the farm has it.
  let timer: ReturnType<typeof setTimeout> | null = null;
  let off: (() => void) | null = null;
  const stop = () => {
    off?.();
    if (timer) clearTimeout(timer);
  };
  const check = () => {
    const seed = find();
    if (!seed) return;
    stop();
    void client.send(farm, 'rsvp', { seed: seed.seq, answer: 'in' });
  };
  off = replica.subscribe(check);
  timer = setTimeout(stop, PLANTED_WAIT_MS);
  check();
  return result;
}
