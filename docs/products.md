# Kithfield: products

The store catalogue, to create once in App Store Connect (and later Play) and in RevenueCat
project "Kithfield" (`3c2ed0d5`; apps `app8942554fda` for `com.kithfield.app` and
`app60349010fd` for `com.kithfield.app.dev`). The ids here are the ones the code uses
(`packages/contracts/src/http/shop.ts`, `apps/api/src/purchases/catalog.ts`). Prices are proposals
in GBP for the base storefront; the app always shows the store's own `displayPrice`, and the
server never sends a price.

The local StoreKit configuration with every product below is `apps/mobile/storekit/Kithfield.storekit`
(attach it to the Xcode scheme's Run › Options › StoreKit Configuration to buy on the simulator
without App Store Connect).

## 1. Patronage: one subscription group

Subscription group **"Kithfield patrons"** (reference name `patrons`). Levels, highest first, so a
change up takes effect at once and a change down at the next renewal:

| Level | Product id | Type | Price | Reference name | Display name (en) | Description (en) |
|---|---|---|---|---|---|---|
| 1 | `kf.farmplus.monthly` | Auto-renewable, 1 month | £8.99 | Farm Plus monthly | Farm Plus | Patron perks for your whole farm, up to 8 critters |
| 2 | `kf.patron.yearly` | Auto-renewable, 1 year | £34.99 | Patron yearly | Patron, yearly | Every patron perk, for you, for a year |
| 2 | `kf.patron.monthly` | Auto-renewable, 1 month | £3.99 | Patron monthly | Patron, monthly | Every patron perk, for you, month by month |

No free trials and no introductory offers (09-22: "No trial that turns into a charge").

| Product id | Type | Price | Reference name | Display name (en) | Description (en) |
|---|---|---|---|---|---|
| `kf.founding` | Non-consumable | £99.00 | Founding Farmer | Founding Farmer | A lifetime patron, offered in the launch season only |

Founding Farmer is sold until `FOUNDING_ON_SALE_UNTIL` (20 March 2027), then removed from sale in
App Store Connect; the app never shows a countdown.

## 2. Items for yourself: non-consumables

`kf.item.<item>`, one per item that isn't patron-only. Patron-only items (mushroom cottage, pocket
firefly, moonlit and starry night coats) have no product: patrons keep them.

| Product id | Price | Reference name | Display name (en) |
|---|---|---|---|
| `kf.item.windmill` | £4.99 | Cottage: windmill | Windmill |
| `kf.item.treehouse` | £4.99 | Cottage: treehouse | Treehouse |
| `kf.item.houseboat` | £4.99 | Cottage: houseboat | Houseboat |
| `kf.item.lighthouse` | £4.99 | Cottage: lighthouse | Lighthouse |
| `kf.item.carriage` | £4.99 | Cottage: train carriage | Train carriage |
| `kf.item.skep` | £4.99 | Cottage: beehive skep | Beehive skep |
| `kf.item.teapot` | £4.99 | Cottage: teapot cottage | Teapot cottage |
| `kf.item.igloo` | £3.99 | Cottage: igloo | Igloo |
| `kf.item.duckling` | £2.99 | Companion: duckling | Duckling |
| `kf.item.snail` | £2.99 | Companion: shoulder snail | Shoulder snail |
| `kf.item.moth` | £2.99 | Companion: lantern moth | Lantern moth |
| `kf.item.butterfly` | £2.99 | Companion: marmalade butterfly | Marmalade butterfly |
| `kf.item.bee` | £2.99 | Companion: bumblebee | Bumblebee |
| `kf.item.ladybird` | £2.99 | Companion: ladybird | Ladybird |
| `kf.item.calico` | £1.99 | Coat: calico | Calico coat |
| `kf.item.golden` | £1.99 | Coat: golden | Golden coat |
| `kf.item.frost` | £1.99 | Coat: first frost | First frost coat |
| `kf.item.aurora` | £1.99 | Coat: aurora | Aurora coat |
| `kf.item.ember` | £1.99 | Coat: ember | Ember coat |
| `kf.item.cloud` | £1.99 | Coat: cloud | Cloud coat |
| `kf.item.blossom` | £1.99 | Coat: blossom | Blossom coat |
| `kf.item.mossy` | £1.99 | Coat: mossy | Mossy coat |
| `kf.item.chime` | £1.99 | Little thing: wind chime | Wind chime |
| `kf.item.breezy_scarf` | £1.99 | Little thing: breezy scarf | Breezy scarf |
| `kf.item.teacup` | £1.99 | Little thing: fireside teacup | Fireside teacup |
| `kf.item.umbrella` | £1.99 | Little thing: rain umbrella | Rain umbrella |
| `kf.item.pinwheel` | £1.99 | Little thing: pinwheel | Pinwheel |
| `kf.item.lights` | £1.99 | Little thing: friend lights | Friend lights |
| `kf.item.vane` | £1.99 | Little thing: weathervane | Weathervane |
| `kf.item.out_and_about` | £0.99 | Stickers: Out & About | Out & About stickers |
| `kf.item.big_feelings` | £1.49 | Stickers: Big Feelings | Big Feelings stickers |
| `kf.item.cosy_weather` | £0.99 | Stickers: Cosy Weather | Cosy Weather stickers |
| `kf.item.birthday_bloom` | £0.99 | Stickers: Birthday Bloom | Birthday Bloom stickers |
| `kf.item.good_luck` | £0.99 | Stickers: Good Luck | Good Luck stickers |

## 3. Gifts and chip-ins: consumables by price tier

A gift is paid with the consumable at its item's tier; the gift itself is tied to the transaction
by the server (`POST /v1/gifts/:gift/paid`). A chip-in pledge is one of four fixed tiers.

| Product id | Type | Price | Reference name | Display name (en) |
|---|---|---|---|---|
| `kf.gift.099` | Consumable | £0.99 | Gift, 0.99 | A gift |
| `kf.gift.149` | Consumable | £1.49 | Gift, 1.49 | A gift |
| `kf.gift.199` | Consumable | £1.99 | Gift, 1.99 | A gift |
| `kf.gift.299` | Consumable | £2.99 | Gift, 2.99 | A gift |
| `kf.gift.399` | Consumable | £3.99 | Gift, 3.99 | A gift |
| `kf.gift.499` | Consumable | £4.99 | Gift, 4.99 | A gift |
| `kf.chipin.100` | Consumable | £1.00 (Apple tier £0.99 if £1.00 isn't offered) | Chip-in, 1 | A chip-in |
| `kf.chipin.200` | Consumable | £2.00 (or £1.99) | Chip-in, 2 | A chip-in |
| `kf.chipin.300` | Consumable | £3.00 (or £2.99) | Chip-in, 3 | A chip-in |
| `kf.chipin.500` | Consumable | £5.00 (or £4.99) | Chip-in, 5 | A chip-in |

Farm themes (Seaside cove, Cherry valley, Snowy hollow, Mountain lake) have no product: friends
chip in for them, worth £9.99 between them (`THEME_VALUE`).

## 4. RevenueCat

- **Entitlements**: `patron`, attached to `kf.patron.monthly`, `kf.patron.yearly`,
  `kf.farmplus.monthly` and `kf.founding`; `farm_plus`, attached to `kf.farmplus.monthly`.
  Items, gifts and chip-ins get no entitlement: the server records them. Nothing in the app or the
  server reads these entitlements yet (`ENTITLEMENT_IDS` in the contracts is unused): perks come
  from the server's own record of each subscription. Create them anyway, so RevenueCat's
  dashboards and any later client check have them.
- **Offerings**: the default offering `patrons` with packages `$rc_monthly` →
  `kf.patron.monthly`, `$rc_annual` → `kf.patron.yearly`, custom `farm_plus` →
  `kf.farmplus.monthly` and custom `founding` → `kf.founding`. Items, gifts and chip-ins are
  fetched by product id, not through offerings.
- **App user id**: the Kithfield person id (anonymous people too). A person merge moves purchases
  with RevenueCat's `TRANSFER`.
- **Webhook**: `https://dev.kithfield.com/api/v1/webhooks/revenuecat` (dev project app) and
  `https://kithfield.com/api/v1/webhooks/revenuecat` (prd). Set an Authorization header value in
  RevenueCat and the same value as the Worker secret `REVENUECAT_WEBHOOK_AUTH`
  (`wrangler secret put REVENUECAT_WEBHOOK_AUTH --env dev|prd`).
- **REST key** for `POST /v1/purchases/sync`: a secret API key (v1) as the Worker secret
  `REVENUECAT_SECRET_KEY`. Without it, sync answers from what the webhook already told D1.
- **Public SDK keys** (`appl_…`) go to the app as `REVENUECAT_IOS_KEY` when Metro or EAS builds
  (`app.config.ts` `extra.revenueCatIosKey`).

## 5. App Review notes

- 3.1.1: every digital good (cosmetics, gifts, chip-ins, patronage) is an in-app purchase. The
  printed scrapbook and merch are physical goods, paid outside the store.
- 3.1.2: the patron screens (09-03, 09-22) show the title, each period's length and price from
  StoreKit, that it renews automatically, how to cancel, working Terms of Use (EULA) and Privacy
  Policy links, and Restore purchases. Use the same EULA and Privacy URLs in App Store Connect.
- **Chip-ins** (the note for App Review): friends promise a share of a birthday gift or a farm
  theme. Nobody is charged until the promises cover it; the app opens the purchase sheet only then,
  after asking the server that the chip-in is still covered. Each friend then buys their own share
  as a separate consumable (`kf.chipin.*`), for themselves, at the store's price. The app never
  refunds anything: if a birthday chip-in's day ends before everyone has paid, each paid share
  becomes that payer's own (the gift item itself if they don't own it, else shop credit of its
  value, kept in `shop_credits`); a payment that arrives late or twice is treated the same way. A
  theme stays open until it is paid for. Only Apple refunds, through its own process; such a
  refund is recorded against the share. A gift friends chipped in for is delivered by the server
  on behalf of whoever started it (or the next friend who paid, if they left the farm).
- Care is never paywalled; patron perks are cosmetic; bought items, gifts and parcels stay when
  patronage lapses, and what was kept as a patron rests until patronage resumes (§6).

## 6. Decided

### What a patron keeps

A patron keeps anything from the wardrobe while their perks are on. When patronage lapses, what
they kept as a patron rests with the perks and comes back when patronage resumes; it is never
deleted. Bought items, gifts and parcels always stay. A one-month patron doesn't keep the whole
wardrobe for good. The founder decided this on 19 October 2026; the switch is `PATRON_KEEP_ALL =
false` in `apps/api/src/purchases/config.ts`, and the shop's copy says so plainly in en and vi.

### Chip-in payments

Nobody is charged until a chip-in is covered; then each pledger pays their own share. A share paid
for a birthday chip-in that closes before everyone paid, or a second or late payment, becomes the
payer's credit, never a refund: the gift item itself when they don't own it, else its value as
shop credit (`shop_credits`; spending it is for the shop to add). `refund_owed` is set only when
Apple refunds a share. Every valid payment is kept in `chip_in_payments`.

## 7. Decisions pending (one switch each)

| Decision | Switch | Default now |
|---|---|---|
| What Farm Plus "up to 8 critters" means on a farm of up to 24 | `FARM_PLUS_MODE` and `FARM_PLUS_COVERS` in `apps/api/src/purchases/config.ts` | The payer picks one farm (`PUT /v1/me/farm-plus`); its first 8 members by joining time, the payer always included, get the perks |
| How the printed book is paid (Stripe isn't offered to a Vietnamese business) | `bookCheckoutProvider` in `apps/api/src/purchases/book.ts` | No provider: ordering answers 503 `unavailable` ("not available yet"); quotes, order reads and the Stripe-shaped webhook are ready |
| When Founding Farmer stops being sold | `FOUNDING_ON_SALE_UNTIL` in `apps/api/src/purchases/config.ts` | 20 March 2027, 00:00 UTC |
| The monthly parcel and the critter vote | `PARCELS`, `VOTES` in `apps/api/src/purchases/config.ts` | One wardrobe item a month; hare, heron or hedge-pig this autumn and winter |
