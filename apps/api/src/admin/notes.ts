import { SafetyNote, type SafetyNoteList } from '@kithfield/contracts';

import { cottageOf } from '../cottage/stub';
import type { Bindings } from '../env';
import { mintId } from './ids';

/*
 * The quiet notes from the safety team: the reporter hears the outcome for the item (never the
 * sanction), the reported person hears which rule and can ask for another look. A note waits in
 * D1; the person's cottage only says that there is one, never what it says.
 */

type NoteBody =
  | Omit<Extract<SafetyNote, { note: 'report_answered' }>, 'id' | 'at'>
  | Omit<Extract<SafetyNote, { note: 'content_removed' }>, 'id' | 'at'>
  | Omit<Extract<SafetyNote, { note: 'appeal_answered' }>, 'id' | 'at'>;

const NOTES_SHOWN = 100;

/** Leaves a note for a person and lets their cottage know one is waiting. */
export async function leaveNote(
  env: Bindings,
  person: string,
  body: NoteBody,
  at: number,
): Promise<string> {
  const note = SafetyNote.parse({ ...body, id: mintId('N'), at });
  await env.DB.prepare(
    'INSERT INTO safety_notes (id, person_id, at, note_json) VALUES (?, ?, ?, ?)',
  )
    .bind(note.id, person, at, JSON.stringify(note))
    .run();
  try {
    await cottageOf(env, person).noteSafety();
  } catch (error) {
    // The note is kept; the person sees it the next time the app asks.
    console.error('cottage did not take the safety note', { error });
  }
  return note.id;
}

/** `GET /v1/me/safety-notes`: newest first. Reading them clears the cottage's flag. */
export async function readNotes(env: Bindings, person: string): Promise<SafetyNoteList> {
  const { results } = await env.DB.prepare(
    'SELECT note_json FROM safety_notes WHERE person_id = ? ORDER BY at DESC, id DESC LIMIT ?',
  )
    .bind(person, NOTES_SHOWN)
    .all<{ note_json: string }>();
  const notes = results.flatMap((row) => {
    try {
      const parsed = SafetyNote.safeParse(JSON.parse(row.note_json));
      return parsed.success ? [parsed.data] : [];
    } catch {
      return [];
    }
  });
  await cottageOf(env, person).clearSafetyNote();
  return { notes };
}
