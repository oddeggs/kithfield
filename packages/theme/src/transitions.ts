import { type MotionName } from './motion';

export interface Transition {
  /** Signature transitions are built specially; standard ones use native transitions. */
  signature: boolean;
  /** Each timing the storyboard names, in milliseconds. */
  ms: Readonly<Record<string, number>>;
  /** The shared motion it runs on. */
  uses: readonly MotionName[];
}

const t = (signature: boolean, ms: Record<string, number>, uses: MotionName[]): Transition => ({
  signature,
  ms,
  uses,
});

/** The storyboards of `design/18 Motion and Transitions.dc.html`, with the timings each names. */
export const transitions = {
  /** A critter travels: bubble → farm → card, and back. */
  critterTravel: t(true, { out: 480, back: 380 }, ['sheet', 'twos']),
  /** Picker to farm: the chosen critter walks home and the cottage turns real. */
  pickerToFarm: t(true, { total: 2600, carry: 900, walk: 1300, cottage: 400 }, [
    'sheet',
    'twos',
    'reveal',
  ]),
  /** Starting a visit: both critters walk onto the porch. */
  visitStart: t(true, { total: 900 }, ['sheet', 'twos']),
  /** Farm home ↔ chat: the critters carry into the chat header, tracking the finger. */
  farmToChat: t(true, { eachWay: 420 }, ['sheet']),
  /** The valley: zooming out to every farm, and back in. */
  valley: t(false, { total: 450 }, ['sheet']),
  /** Planting a seed: bubble → seed → seed bed → sprout → campfire. */
  plantSeed: t(true, { plant: 1400 }, ['sheet', 'twos']),
  /** A firefly's flight to a door, and arriving on a friend's phone. */
  firefly: t(true, { flight: 1200, arrival: 800 }, ['sheet', 'twos']),
  /** A dewdrop falls, ripples, and a sprout appears in the header. */
  dewdrop: t(true, { total: 700 }, ['fade', 'twos']),
  /** A gift wraps, travels to the step and unwraps onto the critter. */
  gift: t(true, { total: 1500 }, ['sheet', 'twos']),
  /** The fire: zoom in, critters gather, leave, and the flame shrinks into the Dynamic Island. */
  fire: t(true, { in: 600, out: 500 }, ['sheet', 'twos']),
  /** A photo opens full screen, and hangout photos press into a flower. */
  photo: t(false, { viewer: 280, pressing: 1200 }, ['sheet', 'twos']),
  /** Harvest crops gather into the Sunday recap. */
  harvest: t(true, { total: 1100 }, ['sheet', 'twos']),
  /** Answered messages fold into the Quick Tend bouquet. */
  bouquet: t(true, { perCard: 500 }, ['sheet']),
  /** Tab switches: the farm stays put while panels slide. */
  tabSwitch: t(false, { total: 320 }, ['sheet']),
  /** Opening a sheet. */
  sheetOpen: t(false, { total: 320 }, ['sheet']),
  /** A sticker grows from the picker into a message. */
  sticker: t(true, { total: 360 }, ['sheet', 'twos']),
  /** The farm reacts live to an incoming message. */
  farmReacts: t(true, { total: 600 }, ['twos']),
} as const satisfies Record<string, Transition>;

export type TransitionName = keyof typeof transitions;
