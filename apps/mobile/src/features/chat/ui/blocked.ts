import { useBlocked } from '../../../data/blocks';

/** The person ids this person blocked, for hiding what they say: the phone's one block list. */
export function useBlockedIds(): ReadonlySet<string> {
  return useBlocked().people;
}
