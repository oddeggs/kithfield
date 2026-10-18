import type { PersonId } from '@kithfield/contracts';
import { createContext, useContext } from 'react';

import type { Person } from '../model/people';
import type { BubbleItem } from '../model/timeline';

/** What every row of a chat reads: the farm, who's who, and what a row can ask the screen to do. */
export interface RoomValue {
  readonly farm: string;
  readonly me: PersonId | null;
  /** The farm's time zone, for day dividers; null until the farm is read. */
  readonly timeZone: string | null;
  readonly visit: boolean;
  readonly people: ReadonlyMap<PersonId, Person>;
  /** A person's name as the chat says it ("You" for this person, "a friend who left"). */
  readonly nameOf: (person: PersonId | null) => string;
  /** Finds a bubble by seq, for the quote at the top of a reply. */
  readonly bubbleAt: (seq: number) => BubbleItem | null;
  readonly reply: (item: BubbleItem) => void;
  /** `top`: the bubble's top on screen, for the menu to open over it. */
  readonly openMenu: (item: BubbleItem, top: number | null) => void;
  readonly toggleDew: (item: BubbleItem) => void;
  readonly retry: (item: BubbleItem) => void;
  readonly jumpTo: (seq: number) => void;
  readonly wave: (to: PersonId) => void;
  /** Whether a plan planted from this message has sprouted. */
  readonly sproutedFrom: (seq: number) => boolean;
}

const RoomContext = createContext<RoomValue | null>(null);

export const RoomProvider = RoomContext.Provider;

export function useRoom(): RoomValue {
  const room = useContext(RoomContext);
  if (room === null) throw new Error('useRoom needs a RoomProvider');
  return room;
}
