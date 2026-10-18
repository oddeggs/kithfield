import { Critter } from '@kithfield/contracts';
import { z } from 'zod';

/** A small key-value store (the Keychain on the phone). */
export interface DraftStore {
  getItem(key: string): string | null;
  setItemAsync(key: string, value: string): Promise<void>;
}

/**
 * The critter someone starting a farm has chosen, kept on the phone until the farm is planted:
 * the person becomes that critter on the server only then, so a way in cut short in between
 * resumes at planting instead of counting as done.
 */
export const Draft = z.object({ person: z.string(), name: z.string(), critter: Critter });
export type Draft = z.infer<typeof Draft>;

const KEY = 'kithfield.onboarding.draft';

/** The draft `person` left, or null. */
export function readDraft(store: DraftStore, person: string): Draft | null {
  try {
    const raw = store.getItem(KEY);
    const draft = raw ? Draft.safeParse(JSON.parse(raw)) : null;
    return draft?.success && draft.data.person === person ? draft.data : null;
  } catch {
    return null;
  }
}

export function writeDraft(store: DraftStore, draft: Draft): Promise<void> {
  return store.setItemAsync(KEY, JSON.stringify(draft));
}

export function clearDraft(store: DraftStore): Promise<void> {
  return store.setItemAsync(KEY, '');
}
