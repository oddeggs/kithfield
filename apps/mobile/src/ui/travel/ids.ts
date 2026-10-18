/*
 * The ids both ends of a travel agree on, for anchors that live in different features. A feature
 * registers its end with one of these and the other end flies to it by the same id.
 */
export const travelIds = {
  /** A critter standing on its farm (the farm home canvas). */
  farmCritter: (farm: string, person: string) => `farm:critter:${farm}:${person}`,
  /** A critter's face beside a message in a chat. */
  chatFace: (farm: string, seq: number) => `chat:face:${farm}:${seq}`,
  /** The way into the Seed bed from a chat (its header's seed button), where a planted seed lands. */
  seedBedDoor: 'chat:seed-bed',
  /** The seed on the planting sheet, which drops into the Seed bed once it is planted. */
  plantingSeed: 'plans:planting-seed',
} as const;
