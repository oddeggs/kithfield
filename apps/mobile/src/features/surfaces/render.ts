import { APP_GROUP_PATHS } from '@kithfield/contracts';
import { critterLayers } from '@kithfield/art';
import { ImageFormat, Skia, type SkImage } from '@shopify/react-native-skia';

import type { ArtStore } from '../../ui/art/art-store';
import { lookOf } from '../../ui/art/critter-look';
import type { GroupStore } from './group-store';
import { drawingKey, type Drawing, type ImageJob } from './image-plan';

/*
 * Draws the surfaces' PNGs with the art and writes them into the App Group. The art draws on the
 * JS thread, so images are drawn one at a time when the thread is idle, and only those whose
 * drawing changed since they were last written (a manifest beside them keeps each one's key).
 */

const MANIFEST = `${APP_GROUP_PATHS.images}manifest.json`;

/** The scene time stills are drawn at, as the rest of the app draws them. */
const STILL_T = 1.2;

/** Draws `layers` into one transparent image. */
function compose(
  width: number,
  height: number,
  dpr: number,
  layers: readonly { image: SkImage | null; x: number; y: number; w: number; h: number }[],
  background?: string,
): SkImage | null {
  const surface = Skia.Surface.Make(Math.round(width * dpr), Math.round(height * dpr));
  if (!surface) return null;
  const canvas = surface.getCanvas();
  canvas.scale(dpr, dpr);
  const paint = Skia.Paint();
  if (background !== undefined) canvas.drawColor(Skia.Color(background));
  for (const l of layers) {
    if (!l.image) continue;
    canvas.drawImageRect(
      l.image,
      Skia.XYWHRect(0, 0, l.image.width(), l.image.height()),
      Skia.XYWHRect(l.x, l.y, l.w, l.h),
      paint,
    );
  }
  const image = surface.makeImageSnapshot();
  surface.dispose?.();
  return image;
}

/** One drawing as an image, at the phone's density. */
export function draw(store: ArtStore, drawing: Drawing): SkImage | null {
  const { art, dpr } = store;
  if (drawing.type === 'avatar') {
    const layers = store.avatarLayers({
      kind: drawing.critter.species,
      look: lookOf(drawing.critter),
      size: drawing.size,
    });
    const tint = store.avatarTint(drawing.critter.species, drawing.critter.coat);
    return compose(drawing.size, drawing.size, dpr, layers, tint);
  }
  if (drawing.type === 'walker') {
    const size = drawing.size;
    const layers = critterLayers(art, drawing.critter.species, lookOf(drawing.critter), {
      size: size * 0.8,
      state: 'open',
      dir: 1,
      dpr,
    });
    // Each layer is drawn from the critter's feet: stand them at the bottom middle.
    return compose(
      size,
      size,
      dpr,
      layers.map((l) => ({
        image: l.image,
        x: size / 2 - l.originX,
        y: size - l.originY,
        w: l.width,
        h: l.height,
      })),
    );
  }
  const req = {
    scene: drawing.scene,
    width: drawing.width,
    height: drawing.height,
    dpr,
    attrs: drawing.attrs,
  };
  if (drawing.noCritters) art.env.hidden = { sources: art.critterCanvases, drawn: () => undefined };
  let image: SkImage | null;
  try {
    image = art.image(req, STILL_T);
  } finally {
    art.env.hidden = null;
  }
  if (drawing.background === undefined || image === null) return image;
  return compose(
    drawing.width,
    drawing.height,
    dpr,
    [{ image, x: 0, y: 0, w: drawing.width, h: drawing.height }],
    drawing.background,
  );
}

type Manifest = Record<string, string>;

async function readManifest(group: GroupStore): Promise<Manifest> {
  try {
    const raw = await group.read(MANIFEST);
    return raw === null ? {} : (JSON.parse(raw) as Manifest);
  } catch {
    return {};
  }
}

/** Runs `fn` when the JS thread is next idle. */
const idle = () =>
  new Promise<void>((resolve) => {
    if (typeof requestIdleCallback === 'function') requestIdleCallback(() => resolve());
    else setTimeout(resolve, 0);
  });

/**
 * Draws and writes the images among `jobs` that are missing or drawn differently now, one per
 * idle moment, and removes images no job names any more. Answers how many it wrote.
 */
export async function writeImages(
  store: ArtStore,
  group: GroupStore,
  jobs: readonly ImageJob[],
  stopped: () => boolean = () => false,
): Promise<number> {
  const manifest = await readManifest(group);
  const next: Manifest = {};
  let written = 0;
  for (const job of jobs) {
    const key = drawingKey(job.drawing, store.dpr);
    const path = APP_GROUP_PATHS.images + job.name;
    if (manifest[job.name] === key && group.exists(path)) {
      next[job.name] = key;
      continue;
    }
    await idle();
    if (stopped()) break;
    const image = draw(store, job.drawing);
    const bytes = image?.encodeToBytes(ImageFormat.PNG, 100);
    if (!bytes) continue;
    await group.write(path, bytes);
    next[job.name] = key;
    written += 1;
  }
  if (!stopped()) {
    for (const name of Object.keys(manifest)) {
      if (!(name in next)) group.delete(APP_GROUP_PATHS.images + name);
    }
  }
  await group.write(MANIFEST, JSON.stringify(stopped() ? { ...manifest, ...next } : next));
  return written;
}
