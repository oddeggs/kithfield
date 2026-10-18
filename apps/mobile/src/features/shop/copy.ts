import type { Translate } from '@kithfield/i18n';

/*
 * The names the shop's catalogue copy knows, so a name from the server is looked up only when
 * there is copy for it; a newer item this app doesn't know reads as "something from the cart".
 */

export const ITEM_IDS = [
  'windmill',
  'treehouse',
  'houseboat',
  'lighthouse',
  'mushroom',
  'carriage',
  'skep',
  'teapot',
  'igloo',
  'duckling',
  'snail',
  'moth',
  'butterfly',
  'bee',
  'ladybird',
  'firefly',
  'moonlit',
  'calico',
  'golden',
  'frost',
  'aurora',
  'ember',
  'cloud',
  'starry',
  'blossom',
  'mossy',
  'chime',
  'scarf',
  'teacup',
  'umbrella',
  'pinwheel',
  'lights',
  'vane',
  'out_and_about',
  'big_feelings',
  'cosy_weather',
  'birthday_bloom',
  'good_luck',
  'seaside_cove',
  'cherry_valley',
  'snowy_hollow',
  'mountain_lake',
] as const;
export type ItemId = (typeof ITEM_IDS)[number];

const items: ReadonlySet<string> = new Set(ITEM_IDS);
export const isItemId = (id: string): id is ItemId => items.has(id);

export const SET_IDS = [
  'riverbank',
  'lighthouse_keeper',
  'orchard',
  'winter_hollow',
  'teatime',
] as const;
export type SetId = (typeof SET_IDS)[number];

const sets: ReadonlySet<string> = new Set(SET_IDS);
export const isSetId = (id: string): id is SetId => sets.has(id);

export const CART_NAMES = [
  'lanterns',
  'riverbank',
  'orchard',
  'teatime',
  'winter_hollow',
  'meadow',
] as const;
type CartName = (typeof CART_NAMES)[number];
const cartNames: ReadonlySet<string> = new Set(CART_NAMES);
const isCartName = (name: string): name is CartName => cartNames.has(name);

/** An item's name. */
export function itemName(t: Translate, id: string): string {
  return isItemId(id) ? t(`shop.item.${id}.name`) : t('shop.item.unknown');
}

/** An item's line (what it does, or when a coat comes round). */
export function itemBlurb(t: Translate, id: string): string {
  return isItemId(id) ? t(`shop.item.${id}.blurb`) : '';
}

/** A set's name ("Riverbank"). */
export function setName(t: Translate, id: string): string {
  return isSetId(id) ? t(`shop.set.${id}`) : t('shop.item.unknown');
}

/** What a finished set teaches the critter ("learns to row"). */
export function setPose(t: Translate, id: string): string {
  return isSetId(id) ? t(`shop.set.${id}.pose`) : '';
}

/** The week's title on the cart. */
export function cartTitle(t: Translate, name: string): string {
  return isCartName(name) ? t(`shop.cart.${name}`) : t('shop.cart.lanterns');
}
