import type { ShopItem } from '@kithfield/contracts';
import { router } from 'expo-router';

import { useToast } from '../../../ui/components/toast';
import { useLocale } from '../../../ui/locale/locale-provider';
import { useKeepItem, useWear } from '../data/flows';
import { useShop } from '../data/shop-data';
import { onCartNow } from '../format';
import { Pill } from './bits';
import { currentSeason } from './season';

/**
 * The button that keeps an item: keep it (free for patrons, else at the store's price), wear it
 * once it's yours, patrons-only for someone who isn't one, or when it's back on the cart.
 */
export function KeepButton({
  item,
  flex,
  kind = 'go',
  size,
}: {
  readonly item: ShopItem;
  readonly flex: number;
  /** The keep pill's colour: moss on the sheet, honey over the night widget. */
  readonly kind?: 'go' | 'honey';
  readonly size?: number;
}) {
  const shop = useShop();
  const { t } = useLocale();
  const toast = useToast();
  const { state, keep } = useKeepItem();
  const wear = useWear();
  const critter = shop.me?.critter ?? null;
  const owned = shop.entitlements?.owned.includes(item.item) === true;
  // Patrons keep anything from the wardrobe; sticker packs and themes are never part of it.
  const perks = shop.entitlements?.perks === true && item.slot !== null;
  const slot = item.slot;
  const wearing = slot !== null && critter !== null && critter[slot] === item.item;
  if (owned) {
    return (
      <Pill
        label={t(wearing ? 'shop.try.wearing' : 'shop.try.wear')}
        disabled={wearing || slot === null}
        onPress={() => {
          if (slot !== null) void wear(slot, item.item);
        }}
        kind={kind}
        flex={flex}
        {...(size ? { size } : {})}
      />
    );
  }
  const keepIt = async () => {
    if (await keep(item.item, item.product)) {
      toast.show(t('shop.try.kept'));
      if (slot !== null) await wear(slot, item.item);
    }
  };
  if (perks) {
    return (
      <Pill
        label={t('shop.try.keepFree')}
        onPress={() => void keepIt()}
        busy={state === 'busy'}
        kind={kind}
        flex={flex}
        {...(size ? { size } : {})}
      />
    );
  }
  if (item.product === null) {
    return (
      <Pill
        label={t('shop.try.forPatrons')}
        kind="honey"
        onPress={() => router.push('/shop/patrons')}
        flex={flex}
        {...(size ? { size } : {})}
      />
    );
  }
  const week = shop.cart?.items ?? [];
  if (!onCartNow(item, week)) {
    const season = item.back?.season ?? currentSeason();
    return (
      <Pill
        label={t('shop.try.backIn', { season: t(`shop.season.${season}`) })}
        disabled
        onPress={() => undefined}
        flex={flex}
        {...(size ? { size } : {})}
      />
    );
  }
  return (
    <Pill
      label={t('shop.try.keep', { price: shop.priceText(item.product) })}
      disabled={!shop.store.available}
      onPress={() => void keepIt()}
      busy={state === 'busy'}
      kind={kind}
      flex={flex}
      {...(size ? { size } : {})}
    />
  );
}
