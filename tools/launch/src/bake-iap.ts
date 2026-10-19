import { join } from 'node:path';

import { t } from '@kithfield/i18n';
import sharp from 'sharp';

import { type Boards } from './board';
import { writeOpaquePng } from './bake-boards';
import { type Edits } from './in-page';
import { itemScene } from './item-look';
import { type ManifestEntry } from './manifest';
import { SHOP_FILE, STORE_DIR } from './paths';
import { type Product, readProducts } from './products';

/** The try-on screen's selection ring, and an unselected tile's edge (`09-02`). */
const RING_ON = '0 0 0 2.5px #F7F1E7, 0 0 0 4.5px #2a221d';
const RING_OFF = '0 0 0 1px rgba(42,34,29,.12)';
/** The try-on screen's segmented control: the chosen side is paper, the other clear. */
const CHOSEN = '#fffaf2';

/** The screen the review screenshot is taken on (a frame of `09 Shop and Plus`), and how it changes. */
interface Shot {
  frame: string;
  edits?: Edits;
}

/** A gift is bought at its item's tier; each tier is shown with an item sold at that price. */
const GIFT_ITEM: Readonly<Record<string, string>> = {
  'kf.gift.099': 'kf.item.out_and_about',
  'kf.gift.149': 'kf.item.big_feelings',
  'kf.gift.199': 'kf.item.chime',
  'kf.gift.299': 'kf.item.moth',
  'kf.gift.399': 'kf.item.igloo',
  'kf.gift.499': 'kf.item.treehouse',
};

/** Night shows a cottage's lit windows; the lighthouse is shown with its beam, as the design does. */
const NIGHT_COTTAGES = new Set(['lighthouse']);

function tryOn(product: Product, all: readonly Product[], season: string): Shot {
  const item = product.item ?? '';
  const night = product.kind === 'cottage' && NIGHT_COTTAGES.has(item);
  const stage = itemScene(product.kind, item, season, true);
  if (product.kind === 'cottage') stage.attrs['night'] = String(night);
  // The row of tiles: up to six of the same kind, this one among them and ringed.
  const kin = all.filter((p) => p.kind === product.kind);
  const at = kin.findIndex((p) => p.id === product.id);
  const start = Math.max(0, Math.min(at - 2, kin.length - 6));
  const row = kin.slice(start, start + 6);
  const tiles = Array.from({ length: 6 }, (_, i) => row[i]);
  return {
    frame: '09-02',
    edits: {
      texts: [
        { from: 'Lighthouse', to: product.name },
        { from: 'Keep it · £4.99', to: t('en', 'shop.try.keep', { price: product.price }) },
      ],
      arts: [
        { nth: 0, ...stage },
        ...tiles.flatMap((tile, i) =>
          tile ? [{ nth: i + 1, ...itemScene(tile.kind, tile.item ?? '', season, false) }] : [],
        ),
      ],
      tiles: tiles.map((tile, i) => ({
        nth: i + 1,
        style: tile
          ? { boxShadow: tile.id === product.id ? RING_ON : RING_OFF }
          : { visibility: 'hidden' },
      })),
      styles: [
        { text: 'Day', style: { background: night ? 'transparent' : CHOSEN } },
        { text: 'Night', style: { background: night ? CHOSEN : 'transparent' } },
      ],
    },
  };
}

function gift(product: Product, all: readonly Product[], season: string): Shot {
  const item = all.find((p) => p.id === GIFT_ITEM[product.id]);
  if (!item?.item) throw new Error(`${product.id}: no item at its tier`);
  const scene = itemScene(item.kind, item.item, season, false);
  if (scene.scene === 'buddy') scene.attrs['color'] = '#EFE2C8';
  return {
    frame: '09-04',
    edits: {
      texts: [
        { from: 'Lantern moth', to: item.name },
        {
          from: 'Leave it on his step · £2.99',
          to: t('en', 'shop.gift.leave', { price: product.price }),
        },
      ],
      arts: [{ nth: 0, ...scene }],
    },
  };
}

function shotFor(product: Product, all: readonly Product[], season: string): Shot {
  switch (product.kind) {
    case 'subscription':
    case 'founding':
      // One honest screen of tiers: each subscription's price and period, and Founding Farmer.
      return { frame: '09-22' };
    case 'gift':
      return gift(product, all, season);
    case 'chip_in':
      return {
        frame: '09-07',
        edits: {
          texts: [
            { from: 'Chip in · from £1', to: t('en', 'shop.chip.tier', { price: product.price }) },
          ],
        },
      };
    case 'cottage':
    case 'companion':
    case 'coat':
    case 'little_thing':
    case 'sticker_pack':
      return tryOn(product, all, season);
  }
}

/**
 * One App Review screenshot per in-app product (Apple asks for one each), on the shop screen that
 * sells it: an item on the try-on stage with its price, a gift being wrapped at its tier, a
 * chip-in, or the patron tiers. 1179 × 2556, an iPhone screen at 3×.
 */
export async function bakeIapReview(boards: Boards, season = 'spring'): Promise<ManifestEntry[]> {
  const products = readProducts();
  const page = await boards.open(SHOP_FILE, 3, { season, motion: true });
  const entries: ManifestEntry[] = [];
  try {
    for (const product of products) {
      const shot = shotFor(product, products, season);
      const { png } = await page.capture(
        shot.frame,
        'frame',
        shot.edits ? { edits: shot.edits } : {},
      );
      const file = `iap-review/${product.id}.png`;
      await writeOpaquePng(join(STORE_DIR, file), sharp(png));
      const meta = await sharp(png).metadata();
      entries.push({
        file,
        slot: 'iapReview',
        width: meta.width,
        height: meta.height,
        language: 'en',
        source: `${shot.frame}, showing ${product.name} (${product.price})`,
        reference: { render: shot.frame, rect: [0, 0, 393, 852] },
      });
    }
  } finally {
    await page.close();
  }
  console.log(`iap: ${entries.length} review screenshots`);
  return entries;
}
