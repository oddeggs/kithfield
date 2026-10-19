/*
 * The ids both ends of a travel agree on, for anchors that live in different features. A feature
 * registers its end with one of these and the other end flies to it by the same id.
 */
export const travelIds = {
  /** A critter standing on its farm (the farm home canvas). */
  farmCritter: (farm: string, person: string) => `farm:critter:${farm}:${person}`,
  /** The step of a friend's cottage on the farm, where a gift waits. */
  farmDoor: (farm: string, person: string) => `farm:door:${farm}:${person}`,
  /** The basket at the top of a farm's Sunday harvest letter, which its crops hop into. */
  harvestBasket: (farm: string) => `rhythm:basket:${farm}`,
  /** A critter's face beside a message in a chat. */
  chatFace: (farm: string, seq: number) => `chat:face:${farm}:${seq}`,
  /** A sticker sent in a chat, by its write's op id (the same while sending and once landed). */
  chatSticker: (farm: string, opId: string) => `chat:sticker:${farm}:${opId}`,
  /** A person's seat on a visit's porch, in its chat's header. */
  porchSeat: (farm: string, person: string) => `chat:seat:${farm}:${person}`,
  /** Where a sprout comes up in a farm chat's header when a dewdrop is left. */
  chatSprout: (farm: string) => `chat:sprout:${farm}`,
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
