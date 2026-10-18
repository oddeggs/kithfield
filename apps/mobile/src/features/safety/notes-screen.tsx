import type { SafetyNote } from '@kithfield/contracts';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';

import { useCottage, useDataClient } from '../../data';
import { useLocale } from '../../ui/locale/locale-provider';
import { useTabDot } from '../../ui/tab-bar/tab-activity';
import { useSafetyApi } from '../settings/api/use-api';
import { go } from '../settings/go';
import { Group, NavBar, Note, Page, Row } from '../settings/kit/layout';
import { useRemote } from '../settings/use-remote';

/** Opens one note from the safety team as its sheet. */
export const openNote = (note: SafetyNote) =>
  go({ pathname: '/(modal)/safety-note', params: { id: note.id } });

/**
 * When the cottage says a note from the safety team is waiting, shows the newest one once (as a
 * quiet sheet, never a push with its content) and clears the flag. Keeps the You tab's honey dot
 * while it waits.
 */
export function useSafetyNoteArrival(): void {
  const { safetyNote } = useCottage();
  const client = useDataClient();
  const api = useSafetyApi();
  const opening = useRef(false);
  useTabDot('you', safetyNote);
  useEffect(() => {
    if (!safetyNote || opening.current) return;
    opening.current = true;
    api
      .notes()
      .then(async (list) => {
        const newest = list.notes[0];
        await client.cottage.clearSafetyNote();
        if (newest) openNote(newest);
      })
      .catch(() => undefined)
      .finally(() => {
        opening.current = false;
      });
  }, [safetyNote, api, client]);
}

/** Settings › Notes from the safety team: every note, newest first, each opening its sheet. */
export function NotesScreen() {
  const { t, language } = useLocale();
  const api = useSafetyApi();
  const notes = useRemote(() => api.notes());
  useFocusEffect(
    useCallback(() => {
      notes.reload();
    }, [notes.reload]),
  );
  const list = notes.data?.notes ?? [];
  const day = (at: number) =>
    new Intl.DateTimeFormat(language === 'vi' ? 'vi-VN' : 'en-GB', {
      day: 'numeric',
      month: 'long',
    }).format(at);
  const title = (n: SafetyNote) =>
    n.note === 'report_answered'
      ? t('safety.answered.title')
      : n.note === 'content_removed'
        ? n.kind === 'message'
          ? t('safety.removedNote.message')
          : t('safety.removedNote.thing')
        : t('safety.appealed.title');
  return (
    <Page header={<NavBar title={t('safety.notes.title')} />}>
      {list.length > 0 ? (
        <Group>
          {list.map((n) => (
            <Row
              key={n.id}
              icon="lantern"
              title={title(n)}
              subtitle={day(n.at)}
              onPress={() => openNote(n)}
            />
          ))}
        </Group>
      ) : null}
      {notes.data && list.length === 0 ? <Note text={t('safety.notes.none')} /> : null}
    </Page>
  );
}
