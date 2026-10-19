import { describe, expect, it } from 'vitest';

import * as gifts from './http/gifts';
import * as shop from './http/shop';
import * as webhooks from './http/webhooks';
import { at, bea, farm, fig, pip } from './samples.test-data';
import { describeSchemas } from './schema-runner.test-data';

const autumn = { season: 'autumn', year: 2026 };
const lighthouse = {
  item: 'lighthouse',
  kind: 'cottage',
  slot: 'cottage',
  product: 'kf.item.lighthouse',
  giftProduct: 'kf.gift.t499',
  patrons: false,
  set: 'lighthouse_keeper',
  lastOnCart: '2026-06-08',
  back: { season: 'winter', year: 2026 },
};
const mushroom = {
  ...lighthouse,
  item: 'mushroom',
  product: null,
  giftProduct: null,
  patrons: true,
  set: null,
  lastOnCart: null,
  back: null,
};
const riverbank = {
  set: 'riverbank',
  items: ['houseboat', 'umbrella', 'duckling', 'reed_coat'],
  reward: { sticker: 'boat', pose: 'row' },
};
const patronage = {
  tier: 'patron',
  via: 'own',
  period: 'year',
  state: 'active',
  since: at,
  until: at + 365 * 86_400_000,
  store: 'app_store',
};
const pounds = (amount: number) => ({ amount, currency: 'GBP' });

const giftFor = { for: 'gift', to: 'p_june', item: 'treehouse', wrap: 'clay' };
const chipIn = {
  chipIn: 'ci_1',
  farm,
  by: pip,
  what: giftFor,
  state: 'open',
  closesAt: at + 86_400_000,
  filled: 0.8,
  people: [pip, bea, 'p_otis'],
  mine: { tier: 'kf.chipin.t200', state: 'promised' },
};
const bookOrder = {
  order: 'bo_1',
  farm,
  year: 2026,
  cloth: 'moss',
  by: bea,
  state: 'open',
  split: { people: [bea, fig], filled: 0.5, closesAt: at + 7 * 86_400_000 },
};

const rcEvent = {
  id: 'CD489E0E-5D73-4D79-8B48-A1A4D3B1E6B8',
  type: 'INITIAL_PURCHASE',
  app_user_id: bea,
  original_app_user_id: bea,
  aliases: [bea],
  product_id: 'kf.patron.yearly',
  entitlement_ids: ['patron'],
  period_type: 'NORMAL',
  purchased_at_ms: at,
  expiration_at_ms: at + 365 * 86_400_000,
  event_timestamp_ms: at,
  environment: 'SANDBOX',
  store: 'APP_STORE',
  transaction_id: '2000000412345678',
  original_transaction_id: '2000000412345678',
  price: 44.99,
  currency: 'GBP',
  price_in_purchased_currency: 34.99,
};
const stripeEvent = {
  id: 'evt_1Q2w3E4r5T6y7U8i',
  type: 'checkout.session.completed',
  livemode: false,
  created: 1_792_000_000,
  data: {
    object: {
      id: 'cs_test_a1B2c3',
      object: 'checkout.session',
      metadata: { order: 'bo_1', person: bea },
      amount_total: 2400,
      payment_intent: 'pi_3Q2w3E',
    },
  },
};
const livekitEvent = {
  event: 'participant_joined',
  id: 'EV_8f2cA1',
  createdAt: '1792000000',
  room: { name: 'fire-f_thursday_lot', sid: 'RM_x1' },
  participant: {
    identity: bea,
    sid: 'PA_x1',
    attributes: { mode: 'join', captionsOk: 'yes', lantern: 'off' },
  },
};

const samples: Record<string, [valid: unknown[], invalid: unknown[]]> = {
  StoreProductId: [
    ['kf.item.lighthouse', 'kf.patron.monthly'],
    ['KF Item', ''],
  ],
  StoreTransactionId: [
    ['2000000412345678', 'GPA.3372-1234-5678-90123'],
    ['', 'a b'],
  ],
  Store: [['app_store', 'stripe'], ['itunes']],
  ShopItemKind: [['cottage', 'little_thing', 'sticker_pack'], ['loot_box']],
  CritterSlot: [['cottage', 'accessory'], ['hat']],
  ShopItem: [
    [lighthouse, mushroom, { ...lighthouse, kind: 'sticker_pack', slot: null }],
    [
      { ...lighthouse, back: undefined },
      { ...lighthouse, back: 'winter' },
      { ...lighthouse, kind: 'mystery_box' },
    ],
  ],
  ShopSet: [
    [riverbank],
    [
      { ...riverbank, items: ['houseboat'] },
      { ...riverbank, reward: {} },
    ],
  ],
  ShopCatalog: [
    [{ items: [lighthouse, mushroom], sets: [riverbank], wraps: ['clay', 'dusk', 'fern'] }],
    [{ items: [], sets: [], wraps: [] }],
  ],
  ShopCart: [
    [{ week: '2026-10-12', name: 'lanterns_and_lighthouses', items: ['lighthouse', 'moth'] }],
    [
      { week: '2026-10-12', name: 'lanterns', items: [] },
      { week: '2026-10-12', name: 'lanterns', items: Array.from({ length: 13 }, () => 'moth') },
      { week: '2026-10-12', name: 'Lanterns!', items: ['moth'] },
    ],
  ],
  OwnedVia: [['bought', 'parcel', 'founding'], ['stolen']],
  Collection: [
    [
      {
        items: [
          { item: 'houseboat', via: 'bought', from: null, at },
          { item: 'lighthouse', via: 'gift', from: bea, at },
        ],
        rewards: [{ set: 'riverbank', sticker: 'boat', pose: 'row' }],
      },
      { items: [], rewards: [] },
    ],
    [{ items: [{ item: 'houseboat', via: 'bought', at }], rewards: [] }],
  ],
  Patronage: [
    [
      patronage,
      { ...patronage, tier: 'founding', period: 'lifetime', until: null },
      { ...patronage, state: 'lapsed', until: null },
      { ...patronage, tier: 'farm_plus', via: 'farm_plus', period: null, store: null },
    ],
    [
      { ...patronage, tier: 'gold' },
      { ...patronage, state: 'expired' },
      { ...patronage, since: -1 },
    ],
  ],
  Entitlements: [
    [
      { perks: true, patronage, farmPlus: null, owned: ['houseboat'], wallName: 'Ada K.' },
      {
        perks: true,
        patronage: { ...patronage, tier: 'farm_plus', period: 'month' },
        farmPlus: { farm, covered: [bea, pip] },
        owned: [],
        wallName: null,
      },
      { perks: false, patronage: null, farmPlus: null, owned: [], wallName: null },
    ],
    [
      { perks: true, patronage, owned: [], wallName: null },
      { perks: true, patronage, farmPlus: null, owned: [] },
      {
        perks: true,
        patronage,
        farmPlus: { farm, covered: Array.from({ length: 9 }, (_, i) => `p_${i}`) },
        owned: [],
        wallName: null,
      },
    ],
  ],
  FarmPlusChoice: [[{ farm }], [{}]],
  PatronOffer: [
    [{ products: ['kf.patron.monthly', 'kf.patron.yearly', 'kf.founding'], founding: true }],
    [{ products: [], founding: false }],
  ],
  WallEntryId: [
    ['w1', 'w123456789012345'],
    ['w0', 'p_ada', 'w', 'w1234567890123456'],
  ],
  FarmersWall: [
    [
      {
        names: [
          { entry: 'w1', name: 'Ada K.' },
          { entry: 'w42', name: 'Bramble & co' },
        ],
        others: 4212,
        next: 'c_20',
      },
      { names: [], others: 0, next: null },
    ],
    [
      { names: [{ entry: 'w1', name: 'Ada' }], others: -1, next: null },
      { names: [{ entry: 'w1', name: '' }], others: 0, next: null },
      { names: ['Ada K.'], others: 0, next: null },
      { names: [{ entry: 'p_ada', name: 'Ada' }], others: 0, next: null },
    ],
  ],
  WallNameRequest: [
    [{ name: 'Juniper' }, { name: null }],
    [{ name: '' }, {}],
  ],
  CritterVote: [
    [
      { season: autumn, options: ['hare', 'heron', 'hedgehog'], mine: 'hare' },
      { season: autumn, options: ['hare', 'heron'], mine: null },
    ],
    [{ season: autumn, options: ['hare'], mine: null }],
  ],
  CritterVoteRequest: [[{ option: 'heron' }], [{ option: 'Heron!' }]],
  Wishlist: [
    [{ items: [{ item: 'treehouse', at }] }, { items: [] }],
    [{ items: Array.from({ length: 31 }, () => ({ item: 'snail', at })) }],
  ],
  FarmThemes: [
    [
      { owned: ['snowy_hollow'], current: 'snowy_hollow' },
      { owned: [], current: null },
    ],
    [{ owned: ['snowy_hollow'] }],
  ],
  CostsReport: [
    [
      {
        month: '2026-09',
        spent: [{ line: 'servers', amount: pounds(312_000) }],
        income: [{ line: 'patrons', amount: pounds(1_584_000) }],
        setAside: pounds(41_000),
      },
    ],
    [
      { month: '2026-13', spent: [], income: [], setAside: pounds(0) },
      { month: '2026-09', spent: [], income: [], setAside: { amount: 1.5, currency: 'GBP' } },
      { month: '2026-09', spent: [], income: [], setAside: { amount: 1, currency: 'gbp' } },
    ],
  ],
  GiftStartRequest: [
    [{ farm, to: 'p_otis', item: 'moth', wrap: 'clay' }],
    [{ farm, to: 'p_otis', item: 'moth' }],
  ],
  GiftStart: [[{ gift: 'g_7', product: 'kf.gift.t299' }], [{ gift: 'g_7' }]],
  GiftPaidRequest: [[{ transaction: '2000000412345679' }], [{ transaction: '' }]],
  GiftView: [
    [
      { gift: 'g_7', state: 'paid' },
      { gift: 'g_7', state: 'opened' },
    ],
    [{ gift: 'g_7', state: 'read' }],
  ],
  ChipInFor: [
    [giftFor, { ...giftFor, note: 'happy birthday x' }, { for: 'theme', theme: 'snowy_hollow' }],
    [
      { for: 'book', year: 2026 },
      { for: 'gift', to: 'p_june' },
    ],
  ],
  ChipInStartRequest: [[{ for: 'theme', theme: 'seaside_cove' }], [{ for: 'theme' }]],
  PledgeState: [['promised', 'paid', 'released', 'refunded'], ['charged']],
  ChipIn: [
    [
      chipIn,
      { ...chipIn, what: { for: 'theme', theme: 'snowy_hollow' }, closesAt: null, mine: null },
      { ...chipIn, state: 'covered', filled: 1, mine: { tier: 'kf.chipin.t200', state: 'paid' } },
    ],
    [
      { ...chipIn, filled: 1.2 },
      { ...chipIn, mine: { tier: 'kf.chipin.t200', state: 'held' } },
      { ...chipIn, state: 'refunded' },
    ],
  ],
  ChipInList: [[{ chipIns: [chipIn] }, { chipIns: [] }], [{ chipIns: [{ ...chipIn, by: null }] }]],
  ChipInOffer: [[{ tiers: ['kf.chipin.t100', 'kf.chipin.t200'] }], [{ tiers: [] }]],
  ChipInPledgeRequest: [
    [
      { tier: 'kf.chipin.t200', transaction: null },
      { tier: 'kf.chipin.t200', transaction: '2000000412345680' },
    ],
    [{ tier: 'kf.chipin.t200' }, { tier: 'Two pounds', transaction: null }],
  ],
  BookQuote: [
    [
      {
        farm,
        year: 2026,
        hangouts: 12,
        pages: 64,
        sizeCm: 21,
        cloths: ['moss', 'clay'],
        price: pounds(2400),
      },
    ],
    [{ farm, year: 2026, hangouts: 12, pages: 64, sizeCm: 21, cloths: [], price: pounds(2400) }],
  ],
  BookOrderRequest: [
    [{ year: 2026, cloth: 'moss', split: true }],
    [
      { year: 2025, cloth: 'moss', split: false },
      { year: 2026, split: true },
    ],
  ],
  BookCheckout: [
    [{ order: 'bo_1', url: 'https://checkout.stripe.com/c/pay/cs_test_a1B2c3', expiresAt: at }],
    [{ order: 'bo_1', url: 'javascript:alert(1)', expiresAt: at }],
  ],
  BookOrder: [
    [bookOrder, { ...bookOrder, state: 'shipped', split: null }],
    [
      { ...bookOrder, state: 'lost' },
      { ...bookOrder, split: { people: [], filled: 2, closesAt: at } },
    ],
  ],
  RevenueCatEvent: [
    [
      rcEvent,
      {
        id: 'evt_test',
        type: 'TEST',
        app_user_id: bea,
        event_timestamp_ms: at,
        environment: 'SANDBOX',
      },
      { ...rcEvent, type: 'TRANSFER', transferred_from: ['p_anon_7'], transferred_to: [bea] },
      { ...rcEvent, type: 'SOMETHING_NEW', product_id: null, transaction_id: null },
    ],
    [
      { ...rcEvent, environment: 'STAGING' },
      { ...rcEvent, type: 'initial purchase' },
      { ...rcEvent, app_user_id: '' },
      { ...rcEvent, event_timestamp_ms: undefined },
    ],
  ],
  RevenueCatWebhook: [
    [{ api_version: '1.0', event: rcEvent }],
    [{ event: rcEvent }, { api_version: '1.0', event: {} }],
  ],
  BookPaymentMetadata: [[{ order: 'bo_1', person: bea }], [{ order: 'bo_1' }]],
  StripeWebhook: [
    [stripeEvent, { ...stripeEvent, type: 'payment_intent.canceled' }],
    [
      { ...stripeEvent, id: 'cs_123' },
      { ...stripeEvent, data: {} },
      { ...stripeEvent, created: 'yesterday' },
    ],
  ],
  LiveKitWebhook: [
    [
      livekitEvent,
      { event: 'room_finished', id: 'EV_2', createdAt: 1_792_000_000, room: livekitEvent.room },
      { event: 'track_published', id: 'EV_3', createdAt: '1792000001' },
    ],
    [
      { ...livekitEvent, createdAt: 'now' },
      { ...livekitEvent, event: 'Participant Joined' },
      { ...livekitEvent, participant: { sid: 'PA_x1' } },
    ],
  ],
};

describeSchemas(
  'HTTP bodies for the shop, gifts and webhooks',
  { ...shop, ...gifts, ...webhooks },
  samples,
);

describe('the shop', () => {
  it('names products the way the stores and RevenueCat do', () => {
    expect(shop.itemProduct('lighthouse')).toBe('kf.item.lighthouse');
    for (const product of Object.values(shop.PATRON_PRODUCTS)) {
      expect(shop.StoreProductId.safeParse(product).success, product).toBe(true);
    }
    expect(shop.ENTITLEMENT_IDS).toEqual({ patron: 'patron', farmPlus: 'farm_plus' });
  });

  it('never sends an App Store price, and keeps chip-in amounts private', () => {
    const keys = (schema: { toJSONSchema: () => unknown }) => JSON.stringify(schema.toJSONSchema());
    for (const schema of [shop.ShopItem, shop.ShopCatalog, shop.Entitlements]) {
      expect(keys(schema)).not.toMatch(/"(price|amount|displayPrice)"/);
    }
    for (const schema of [gifts.ChipIn, gifts.ChipInList, gifts.BookOrder, gifts.GiftView]) {
      expect(keys(schema)).not.toMatch(/"(amount|price|total|tally)"/);
    }
  });

  it('acknowledges webhook types it does not know rather than failing them', () => {
    expect(webhooks.KNOWN_REVENUECAT_EVENTS).toContain('NON_RENEWING_PURCHASE');
    const unknown = { ...rcEvent, type: 'VIRTUAL_CURRENCY_TRANSACTION' };
    expect(webhooks.RevenueCatEvent.safeParse(unknown).success).toBe(true);
    expect(webhooks.KNOWN_LIVEKIT_EVENTS).toContain('participant_left');
    expect(webhooks.KNOWN_STRIPE_EVENTS).toContain('checkout.session.completed');
  });
});
