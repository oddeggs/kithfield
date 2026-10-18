import type { EnCatalogue } from './catalogue-types';

/**
 * Kithfield's own words, from the glossary in `01 Foundations`. Use them in all copy, and never
 * the words noted against each one. Each comment gives the term's meaning.
 */
export const glossaryEn = {
  /** A shared space for one friend group. Never "group" or "server". */
  'glossary.farm': 'Farm',
  /** Your character on a farm. Never "avatar" or "user". */
  'glossary.critter': 'Critter',
  /** A one-to-one chat on a porch. Never "DM". */
  'glossary.visit': 'Visit',
  /** Any care that grows the farm. */
  'glossary.tending': 'Tending',
  /** "Saw this, smiled" reaction. */
  'glossary.dewdrop': 'Dewdrop',
  /** A thinking-of-you left on a doorstep. */
  'glossary.firefly': 'Firefly',
  /** A message marked no reply needed. */
  'glossary.quietNote': 'Quiet note',
  /** A plan without a day, place or enough yeses yet; "sprouted" once it has all three. */
  'glossary.seed': 'Seed',
  /** Where plans live. */
  'glossary.seedBed': 'Seed bed',
  /** The drop-in voice room. Never "call" or "meeting". */
  'glossary.sitByTheFire': 'Sit by the fire',
  /** Turn your camera on by the fire. */
  'glossary.lightYourLantern': 'Light your lantern',
  /** Quiet for a while. Never "inactive", "offline" or "dead". */
  'glossary.dozing': 'Dozing',
  /** Quiet for a while (the same state as dozing). Never "inactive", "offline" or "dead". */
  'glossary.sleepy': 'Sleepy',
  /** Social battery open. */
  'glossary.lampOn': 'Lamp on',
  /** Pause every nudge everywhere. */
  'glossary.hibernate': 'Hibernate',
  /** A member who can manage the farm. Never "admin" in UI copy. */
  'glossary.keeper': 'Keeper',
  /** Someone left the farm. Never "left the group". */
  'glossary.goneWandering': 'Gone wandering',
  /** The book of plants the farm has grown. */
  'glossary.fieldGuide': 'Field guide',
  /** Season-end gathering of crops. */
  'glossary.harvestDay': 'Harvest day',
  /** The optional membership. Not translated. */
  'glossary.kithfieldPlus': 'Kithfield+',
} as const satisfies EnCatalogue;
