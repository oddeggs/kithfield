import {
  LIT_WINDOW_MS,
  type Critter,
  type SurfaceData,
  type SurfaceFarm,
} from '@kithfield/contracts';

import { HOMES, imageNames, litMask } from './names';

/*
 * Which PNGs the surfaces need for what the app is about to write, each with the drawing that
 * makes it. Pure: the renderer draws only the ones whose drawing changed since it last wrote them.
 */

/** A drawing of the art, at a size in points. */
export type Drawing =
  | {
      readonly type: 'scene';
      readonly scene: string;
      readonly width: number;
      readonly height: number;
      readonly attrs: Readonly<Record<string, string | boolean>>;
      /** Drawn without its critters, which a surface places itself. */
      readonly noCritters?: boolean;
      /** Painted under the drawing, for a scene with no paper of its own. */
      readonly background?: string;
    }
  | { readonly type: 'avatar'; readonly critter: Critter; readonly size: number }
  | { readonly type: 'walker'; readonly critter: Critter; readonly size: number };

export interface ImageJob {
  readonly name: string;
  readonly drawing: Drawing;
}

/** Widget sizes on a 393-point-wide phone (iPhone 16), as the design draws them. */
export const WIDGET = {
  small: { width: 158, height: 158 },
  medium: { width: 338, height: 158 },
  large: { width: 338, height: 354 },
} as const;

/** The farm's own still, as a push's picture and the share sheet's thumbnail. */
const STILL = { width: 393, height: 236 } as const;

/** Of the farms, the widgets draw the newest few, and only farms (a visit has no farm art). */
export const WIDGET_FARMS = 4;

/** The plan push's seed sits on the design's warm card. */
const SEED_CARD = '#F3DDA9';

/** The art icons the surfaces show, in the colours the design gives them. */
export const ICONS = {
  lantern: '#2a221d',
  muted: '#ffffff',
  mic: '#ffffff',
  check: '#ffffff',
} as const;

/** The lit windows at `at`, by the art's kind names. */
export function litAt(farm: SurfaceFarm, at: number): Set<string> {
  const lit = new Set<string>();
  for (const c of farm.critters) {
    if (c.hibernating || c.lastOpenedAt === null || c.lastOpenedAt > at) continue;
    if (c.pausedUntil !== null && c.pausedUntil > at) continue;
    if (at - c.lastOpenedAt < LIT_WINDOW_MS) lit.add(c.critter.species);
  }
  return lit;
}

/** The lit sets the widget's timeline will show from `now`: now, then as each window goes dark. */
export function litTimeline(farm: SurfaceFarm, now: number): Set<string>[] {
  const dims = farm.critters
    .filter((c) => litAt({ ...farm, critters: [c] }, now).size > 0 && c.lastOpenedAt !== null)
    .map((c) => (c.lastOpenedAt ?? 0) + LIT_WINDOW_MS)
    .sort((a, b) => a - b);
  const sets = [now, ...dims].map((at) => litAt(farm, at));
  const seen = new Set<number>();
  return sets.filter((set) => {
    const mask = litMask(set);
    if (seen.has(mask)) return false;
    seen.add(mask);
    return true;
  });
}

const litAttr = (lit: Set<string>) => {
  const kinds = HOMES.filter((k) => lit.has(k));
  return kinds.length > 0 ? kinds.join(',') : 'none';
};

const seasonOf = (farm: SurfaceFarm) => farm.season.season;

/** Someone whose critter the surfaces draw though no farm lists them: the person themselves. */
export interface ExtraCritter {
  readonly person: string;
  readonly critter: Critter;
}

/** Every image `data` names or implies, once each. */
export function imageJobs(
  data: SurfaceData,
  now: number,
  extra: readonly ExtraCritter[] = [],
): ImageJob[] {
  const jobs = new Map<string, Drawing>();
  const add = (name: string, drawing: Drawing) => {
    if (!jobs.has(name)) jobs.set(name, drawing);
  };
  const scene = (
    name: string,
    s: string,
    size: { width: number; height: number },
    attrs: Record<string, string | boolean>,
    extra: { noCritters?: boolean; background?: string } = {},
  ) => add(name, { type: 'scene', scene: s, ...size, attrs, ...extra });

  const widgetFarms = new Set(
    data.farms
      .filter((f) => f.kind === 'farm')
      .slice(0, WIDGET_FARMS)
      .map((f) => f.farm),
  );
  for (const farm of data.farms) {
    const season = seasonOf(farm);
    const lit = litAt(farm, now);
    scene(farm.images.day, 'strip', STILL, { season });
    scene(farm.images.night, 'widget', STILL, { season, lit: litAttr(lit) });
    scene(imageNames.smallFire(season), 'firesmall', WIDGET.small, { season });
    scene(
      imageNames.walk(season),
      'walk',
      { width: 345, height: 92 },
      { season },
      { noCritters: true },
    );
    scene(imageNames.fireRoom(season), 'fire2', { width: 96, height: 64 }, { season, items: '' });
    if (widgetFarms.has(farm.farm)) {
      for (const set of litTimeline(farm, now)) {
        const mask = litMask(set);
        const attrs = { season, lit: litAttr(set) };
        scene(imageNames.medium(farm.farm, mask), 'widget', WIDGET.medium, attrs);
        scene(imageNames.large(farm.farm, mask), 'widget', WIDGET.large, attrs);
      }
      if (farm.fire !== null) {
        scene(imageNames.mediumFire(farm.farm), 'widget', WIDGET.medium, {
          season,
          lit: litAttr(lit),
          state: 'fire',
        });
      }
    }
    for (const critter of farm.critters) {
      add(critter.image, { type: 'avatar', critter: critter.critter, size: 64 });
      add(imageNames.walker(critter.person), {
        type: 'walker',
        critter: critter.critter,
        size: 40,
      });
    }
  }
  for (const { person, critter } of extra) {
    add(imageNames.critter(person), { type: 'avatar', critter, size: 64 });
    add(imageNames.walker(person), { type: 'walker', critter, size: 40 });
  }
  scene(
    imageNames.seed,
    'seed',
    { width: 360, height: 150 },
    { stage: '3' },
    { background: SEED_CARD },
  );
  scene(imageNames.appIcon, 'appicon', { width: 48, height: 48 }, {});
  for (const [name, color] of Object.entries(ICONS)) {
    scene(imageNames.icon(name), 'icon', { width: 24, height: 24 }, { name, color });
  }
  return [...jobs].map(([name, drawing]) => ({ name, drawing }));
}

/** A drawing's identity: the renderer redraws an image only when this changes. */
export const drawingKey = (drawing: Drawing, dpr: number): string => JSON.stringify([drawing, dpr]);
