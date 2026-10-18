/*
 * Where people sit around the fire. The eight logs are the fire scene's own (`fire2` in
 * `design/kithfield-art.js`): each a place as fractions of the scene, a critter size as a
 * fraction of its width, and which way the critter faces. Seats are kept: someone who heads home
 * leaves their log empty, and nobody else shuffles round. Past eight, people sit as a ring of
 * small lanterns.
 */

export interface Slot {
  /** The critter's feet, as fractions of the scene's width and height. */
  readonly x: number;
  readonly y: number;
  /** The critter's size as a fraction of the scene's width. */
  readonly size: number;
  /** 1 faces right, -1 faces left (towards the fire, mostly). */
  readonly dir: 1 | -1;
}

export const SLOTS: readonly Slot[] = [
  { x: 0.16, y: 0.66, size: 0.21, dir: 1 },
  { x: 0.84, y: 0.66, size: 0.2, dir: -1 },
  { x: 0.5, y: 0.545, size: 0.15, dir: 1 },
  { x: 0.32, y: 0.71, size: 0.17, dir: 1 },
  { x: 0.68, y: 0.71, size: 0.17, dir: -1 },
  { x: 0.29, y: 0.575, size: 0.13, dir: 1 },
  { x: 0.71, y: 0.575, size: 0.13, dir: -1 },
  { x: 0.9, y: 0.765, size: 0.17, dir: -1 },
];

/** Seats drawn around the fire; more people sit as lanterns. */
export const DRAWN_SEATS = SLOTS.length;

/** Where the scene sets the fire, as fractions of it (the campfire's `meta.fire`). */
export const FIRE_AT = { x: 0.5, y: 0.62 } as const;

/** Where a critter comes up the path from, and heads home to (`fire2`'s walk and home). */
export const PATH_END = { x: 0.97, y: 0.5 } as const;
export const PATH_HOME = { x: 0.98, y: 0.49 } as const;
/** Where the walk home joins the path (`fire2`'s `home` starts here). */
export const PATH_FOOT = { x: 0.62, y: 0.64 } as const;

/** Seats by person id: an index into `SLOTS`. */
export type Seating = Readonly<Record<string, number>>;

/**
 * Seats for the people by the fire, in the order they sat down. Everyone keeps the seat they
 * had; newcomers take the first free log. Whoever doesn't fit has no seat.
 */
export function seatPeople(previous: Seating, people: readonly string[]): Seating {
  const next: Record<string, number> = {};
  const taken = new Set<number>();
  for (const id of people) {
    const seat = previous[id];
    if (seat !== undefined && !taken.has(seat)) {
      next[id] = seat;
      taken.add(seat);
    }
  }
  for (const id of people) {
    if (next[id] !== undefined) continue;
    let free = 0;
    while (free < DRAWN_SEATS && taken.has(free)) free++;
    if (free >= DRAWN_SEATS) continue;
    next[id] = free;
    taken.add(free);
  }
  return next;
}

/** Same seats for the same people: lets a screen keep its seating object when nothing moved. */
export const sameSeating = (a: Seating, b: Seating): boolean => {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => a[k] === b[k]);
};

/**
 * Where a seat's name chip sits, centred, as fractions of the scene: just under the critter's
 * feet, except the back-left log, whose chip goes up and right of the critter so it clears the
 * log in front of it.
 */
export function chipAt(seat: number): { readonly x: number; readonly y: number } {
  const slot = SLOTS[seat] ?? SLOTS[0];
  if (seat === 5) return { x: 150 / 393, y: 430 / 852 };
  return { x: slot?.x ?? 0, y: (slot?.y ?? 0) + 8 / 852 };
}

/** How much the firelight leaves a critter dark, 0 (in the light) to 1, at a seat. */
export function shadeAt(x: number, y: number, width: number, height: number): number {
  // The scene's `night()` pass: a dark wash cut away by the fire's light, a radial gradient of
  // radius 0.54 of the width from just above the fire, fully clear at its middle, half at 0.55.
  const fx = FIRE_AT.x * width;
  const fy = FIRE_AT.y * height - 20;
  const r = 0.54 * width;
  const d = Math.hypot(x * width - fx, y * height - fy) / r;
  const light = d >= 1 ? 0 : d <= 0.55 ? 1 - (d / 0.55) * 0.5 : 0.5 * (1 - (d - 0.55) / 0.45);
  return 1 - light;
}
