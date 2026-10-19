import { shopMotion } from '@kithfield/theme';
import {
  type ArtId,
  type ChipIn,
  type Critter,
  type FarmId,
  type Id,
  type PersonId,
  type StoreProductId,
} from '@kithfield/contracts';
import { useCallback, useState } from 'react';

import { ApiError } from '../../../data';
import { useDataClient } from '../../../data/react';
import { useLocale } from '../../../ui/locale/locale-provider';
import { useToast } from '../../../ui/components/toast';
import type { BuyResult } from '../store/store';
import { payGate } from '../chip/pay-gate';
import { leaveGift, type PendingGift } from './pending-gifts';
import { dropPendingGift, keepPendingGift } from './pending-gifts-store';
import { useShop } from './shop-data';

/*
 * The shop's flows from tap to done: keeping an item, giving one, chipping in and becoming a
 * patron. The store sells, the server learns of it (RevenueCat's webhook, or a sync the app asks
 * for) and only the server's answer says something is owned.
 */

/** How long to wait between asking the server whether a purchase has landed. */
const LANDING_WAIT_MS = shopMotion.landingWaitMs;
const LANDING_TRIES = 6;

const wait = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

/** A flow's state, for its button: idle, or waiting on the store or the server. */
export type FlowState = 'idle' | 'busy';

/** Says why a purchase didn't happen, or nothing when the person simply closed the sheet. */
function useStoreNotice(): (result: BuyResult) => void {
  const toast = useToast();
  const { t } = useLocale();
  return useCallback(
    (result: BuyResult) => {
      if (result.kind === 'unavailable') toast.show(t('shop.store.unavailable'));
      else if (result.kind === 'pending') toast.show(t('shop.store.waiting'));
      else if (result.kind === 'failed') toast.show(t('shop.failed'));
    },
    [t, toast],
  );
}

/**
 * Keeping an item for yourself: free for patrons (the whole wardrobe), else bought in the store.
 * Answers true once the server says it's owned.
 */
export function useKeepItem(): {
  readonly state: FlowState;
  readonly keep: (item: ArtId, product: StoreProductId | null) => Promise<boolean>;
} {
  const shop = useShop();
  const notice = useStoreNotice();
  const toast = useToast();
  const { t } = useLocale();
  const [state, setState] = useState<FlowState>('idle');
  const keep = useCallback(
    async (item: ArtId, product: StoreProductId | null) => {
      setState('busy');
      try {
        // Patrons keep any wardrobe item free; sticker packs are bought like anyone's.
        const wardrobe = (shop.item(item)?.slot ?? null) !== null;
        if (shop.entitlements?.perks === true && wardrobe) {
          shop.setEntitlements(await shop.api.keep(item));
          void shop.refreshCollection();
          return true;
        }
        if (product === null) return false;
        const result = await shop.store.buy(product);
        if (result.kind !== 'bought') {
          notice(result);
          return false;
        }
        for (let i = 0; i < LANDING_TRIES; i++) {
          const next = await shop.api.sync();
          shop.setEntitlements(next);
          if (next.owned.includes(item)) {
            void shop.refreshCollection();
            return true;
          }
          await wait(LANDING_WAIT_MS);
        }
        toast.show(t('shop.store.waiting'));
        return false;
      } catch {
        toast.show(t('shop.failed'));
        return false;
      } finally {
        setState('idle');
      }
    },
    [notice, shop, t, toast],
  );
  return { state, keep };
}

/** The critter's slot an item fills, wearing it (or taking it off with `null`). */
export function useWear(): (slot: keyof Critter, item: ArtId | null) => Promise<boolean> {
  const { api } = useDataClient();
  const shop = useShop();
  const toast = useToast();
  const { t } = useLocale();
  return useCallback(
    async (slot: keyof Critter, item: ArtId | null) => {
      const critter = shop.me?.critter;
      if (!critter) return false;
      try {
        shop.setMe(await api.updateProfile({ critter: { ...critter, [slot]: item } }));
        return true;
      } catch {
        toast.show(t('shop.failed'));
        return false;
      }
    },
    [api, shop, t, toast],
  );
}

export interface GiftInput {
  readonly farm: FarmId;
  readonly to: PersonId;
  readonly item: ArtId;
  readonly wrap: ArtId;
  readonly note?: string;
  /** Left at the gate of `farm` while visiting it. */
  readonly gate?: boolean;
}

/**
 * Giving a gift: the server reserves the gift's id, the store sells the gift at its tier, the
 * server ties the transaction to it, and the phone leaves `gift {given}` on the farm (or the gift
 * at its gate, visiting). Answers
 * `given`, or why not (`owned`: the friend has it; `unavailable`: it can't be given; `stopped`:
 * the store didn't sell it or the server hasn't heard yet).
 */
export function useGiveGift(farm: FarmId): {
  readonly state: FlowState;
  readonly give: (gift: GiftInput) => Promise<'given' | 'owned' | 'unavailable' | 'stopped'>;
} {
  const shop = useShop();
  const client = useDataClient();
  const notice = useStoreNotice();
  const toast = useToast();
  const { t } = useLocale();
  const [state, setState] = useState<FlowState>('idle');
  const give = useCallback(
    async (input: GiftInput) => {
      setState('busy');
      try {
        const started = await shop.api.startGift({
          farm: input.farm,
          to: input.to,
          item: input.item,
          wrap: input.wrap,
        });
        const pending: PendingGift = {
          gift: started.gift,
          farm: input.farm,
          to: input.to,
          item: input.item,
          wrap: input.wrap,
          ...(input.note ? { note: input.note } : {}),
          ...(input.gate ? { gate: true as const } : {}),
          transaction: null,
          at: Date.now(),
        };
        // Kept on the phone until the farm has it, so a crash after paying never loses the gift.
        await keepPendingGift(shop.person, pending);
        const result = await shop.store.buy(started.product);
        if (result.kind !== 'bought') {
          notice(result);
          if (result.kind !== 'pending') await dropPendingGift(shop.person, started.gift);
          return 'stopped';
        }
        await keepPendingGift(shop.person, { ...pending, transaction: result.transaction });
        let paid = false;
        for (let i = 0; i < LANDING_TRIES && !paid; i++) {
          paid = (await shop.api.giftPaid(started.gift, result.transaction)).state !== 'unpaid';
          if (!paid) await wait(LANDING_WAIT_MS);
        }
        if (!paid) {
          toast.show(t('shop.store.waiting'));
          return 'stopped';
        }
        const left = await leaveGift(pending, { send: client.send, atGate: shop.api.atGate });
        if (!left) {
          toast.show(t('shop.gift.cant'));
          return 'unavailable';
        }
        return 'given';
      } catch (error) {
        if (error instanceof ApiError && error.code === 'conflict') return 'owned';
        if (error instanceof ApiError && error.code === 'unavailable') return 'unavailable';
        toast.show(t('shop.failed'));
        return 'stopped';
      } finally {
        setState('idle');
      }
    },
    [client, farm, notice, shop, t, toast],
  );
  return { state, give };
}

/**
 * Chipping in at a tier: a promise (nothing charged until it's covered), or paying a promise once
 * the chip-in is covered. Answers the chip-in as the server now sees it, or null.
 */
export function usePledge(): {
  readonly state: FlowState;
  readonly promise: (chipIn: Id, tier: StoreProductId) => Promise<ChipIn | null>;
  /** Pays a promised share once the chip-in is covered; answers the chip-in as it is now. */
  readonly pay: (farm: FarmId, chipIn: Id) => Promise<ChipIn | null>;
} {
  const shop = useShop();
  const notice = useStoreNotice();
  const toast = useToast();
  const { t } = useLocale();
  const [state, setState] = useState<FlowState>('idle');
  const promise = useCallback(
    async (chipIn: Id, tier: StoreProductId) => {
      setState('busy');
      try {
        return await shop.api.pledge(chipIn, { tier, transaction: null });
      } catch {
        toast.show(t('shop.failed'));
        return null;
      } finally {
        setState('idle');
      }
    },
    [shop, t, toast],
  );
  const pay = useCallback(
    async (farm: FarmId, chipIn: Id) => {
      setState('busy');
      try {
        const gate = payGate(chipIn, (await shop.api.chipIns(farm)).chipIns);
        if (gate.kind === 'gone') return null;
        if (gate.kind === 'refresh') return gate.chipIn;
        const tier = gate.tier;
        const result = await shop.store.buy(tier);
        if (result.kind !== 'bought') {
          notice(result);
          return null;
        }
        for (let i = 0; i < LANDING_TRIES; i++) {
          const next = await shop.api.pledge(chipIn, { tier, transaction: result.transaction });
          if (next.mine?.state === 'paid') return next;
          await wait(LANDING_WAIT_MS);
        }
        toast.show(t('shop.store.waiting'));
        return null;
      } catch {
        toast.show(t('shop.failed'));
        return null;
      } finally {
        setState('idle');
      }
    },
    [notice, shop, t, toast],
  );
  return { state, promise, pay };
}

/** Becoming a patron (or switching plan): the store's subscription sheet, then the server's view. */
export function useBecomePatron(): {
  readonly state: FlowState;
  readonly subscribe: (product: StoreProductId) => Promise<boolean>;
} {
  const shop = useShop();
  const notice = useStoreNotice();
  const toast = useToast();
  const { t } = useLocale();
  const [state, setState] = useState<FlowState>('idle');
  const subscribe = useCallback(
    async (product: StoreProductId) => {
      setState('busy');
      try {
        const result = await shop.store.buy(product);
        if (result.kind !== 'bought') {
          notice(result);
          return false;
        }
        for (let i = 0; i < LANDING_TRIES; i++) {
          const next = await shop.api.sync();
          shop.setEntitlements(next);
          if (next.perks) return true;
          await wait(LANDING_WAIT_MS);
        }
        toast.show(t('shop.store.waiting'));
        return false;
      } catch {
        toast.show(t('shop.failed'));
        return false;
      } finally {
        setState('idle');
      }
    },
    [notice, shop, t, toast],
  );
  return { state, subscribe };
}

/** Restore purchases: the store, then the server's view of what that brought back. */
export function useRestore(): () => Promise<void> {
  const shop = useShop();
  const toast = useToast();
  const { t } = useLocale();
  return useCallback(async () => {
    const reached = await shop.store.restore();
    if (!reached) {
      toast.show(t('shop.store.unavailable'));
      return;
    }
    try {
      const before = shop.entitlements;
      const next = await shop.api.sync();
      shop.setEntitlements(next);
      void shop.refreshCollection();
      const more =
        next.owned.length > (before?.owned.length ?? 0) || (next.perks && before?.perks !== true);
      toast.show(t(more ? 'shop.store.restored' : 'shop.store.nothing'));
    } catch {
      toast.show(t('shop.failed'));
    }
  }, [shop, t, toast]);
}
