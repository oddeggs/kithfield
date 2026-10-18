/*
 * The ids both ends of a travel agree on, for anchors that live in different features. A feature
 * registers its end with one of these and the other end flies to it by the same id.
 */
export const travelIds = {
  /** A critter standing on its farm (the farm home canvas). */
  farmCritter: (farm: string, person: string) => `farm:critter:${farm}:${person}`,
  /** A critter's face beside a message in a chat. */
  chatFace: (farm: string, seq: number) => `chat:face:${farm}:${seq}`,
  /** The dewdrop on a message's chip, where its ripples spread. */
  dewdrop: (farm: string, seq: number) => `chat:dewdrop:${farm}:${seq}`,
  /** A Quick Tend card, and the bouquet its answer folds into. */
  tendCard: (key: string) => `gestures:tend:${key}`,
  bouquet: 'gestures:bouquet',
  /** A critter's tile in the onboarding picker, and the stage it carries to. */
  pickerTile: (species: string) => `onboarding:tile:${species}`,
  pickerStage: 'onboarding:stage',
  /** The seed on the planting sheet, which drops into the Seed bed once it is planted. */
  plantingSeed: 'plans:planting-seed',
} as const;
