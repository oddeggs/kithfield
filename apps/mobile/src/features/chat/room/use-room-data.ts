import type { PersonId } from '@kithfield/contracts';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  useDataClient,
  useFarm,
  useFarmEvents,
  useFarmLink,
  useOpenFarm,
  usePresence,
  useRejections,
  useSend,
} from '../../../data';
import { useToast } from '../../../ui/components/toast';
import { useLocale } from '../../../ui/locale/locale-provider';
import { useSession } from '../../../ui/session/session';
import { useUpload, useUploads } from '../../media';
import { fetchPreview, firstUrl } from '../model/link-preview';
import { mentionsIn, type Mentionable } from '../model/mentions';
import { refusalOf, retryRefused } from '../model/refusals';
import { peopleOf } from '../model/people';
import { buildTimeline, type BubbleItem, type TimelineItem } from '../model/timeline';
import { uploadDrafts, uploadOf } from '../model/uploads';
import type { Recorded } from './voice-recorder';

const PAGE = 50;
/** How long a link's preview may take before the message goes without one. */
const PREVIEW_WAIT_MS = 2500;

/** The time, refreshed twice a minute: enough for slow posts arriving and day dividers. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/** Everything a chat reads and writes: the folded timeline, paging, presence and the writes. */
export function useRoomData(farm: string) {
  useOpenFarm(farm);
  const client = useDataClient();
  const send = useSend(farm);
  const toast = useToast();
  const { t } = useLocale();
  const replica = useFarm(farm);
  const me = useSession().person?.id ?? null;
  const [limit, setLimit] = useState(80);
  const events = useFarmEvents(farm, limit);
  const allRejections = useRejections();
  const refused = useMemo(
    () => allRejections.filter((r) => r.farm === farm),
    [allRejections, farm],
  );
  const presence = usePresence(farm);
  const link = useFarmLink(farm);
  const now = useNow();
  const state = replica?.state ?? null;
  const upload = useUpload();
  const uploads = useUploads(farm);
  // Photos and voice notes still going up, drawn as writes on their way until the queue sends them.
  const going = useMemo(
    () => uploadDrafts(uploads, new Set((replica?.pending ?? []).map((w) => w.opId))),
    [uploads, replica?.pending],
  );

  const timeline: TimelineItem[] = useMemo(
    () =>
      buildTimeline({
        events,
        unsent: [...(replica?.pending ?? []), ...going.unsent],
        refused: [...refused, ...going.refused],
        me,
        state,
        now,
      }),
    [events, replica?.pending, going, refused, me, state, now],
  );
  // Who's who changes far less often than the farm: rows re-render only when it does.
  const cast = JSON.stringify([
    [...(state?.members ?? []), ...(state?.former ?? [])].map((m) => [m.person, m.name, m.critter]),
    state?.aliases ?? null,
  ]);
  const people = useMemo(() => peopleOf(state), [cast]);
  const bubbles = useMemo(() => {
    const map = new Map<number, BubbleItem>();
    for (const item of timeline)
      if (item.type === 'bubble' && item.seq !== null) map.set(item.seq, item);
    return map;
  }, [timeline]);

  // Older history: the phone's cache first, then a page from the farm.
  const [older, setOlder] = useState<'idle' | 'loading' | 'done'>('idle');
  const paging = useRef(false);
  const loadOlder = useCallback(async () => {
    if (paging.current || older === 'done') return;
    const oldest = events[0]?.seq;
    if (oldest === undefined || oldest <= 1) {
      setOlder('done');
      return;
    }
    paging.current = true;
    setOlder('loading');
    try {
      const cached = await client.events(farm, { before: oldest, limit: PAGE });
      const more = cached.length >= PAGE ? true : await client.pageHistory(farm, oldest, PAGE);
      setLimit((l) => l + PAGE);
      setOlder(more || cached.length > 0 ? 'idle' : 'done');
    } catch {
      setOlder('idle');
    } finally {
      paging.current = false;
    }
  }, [client, events, farm, older]);

  const write = useCallback(
    async (kind: string, payload: unknown): Promise<boolean> => {
      const result = await send(kind, payload);
      if (result.status === 'refused') {
        const { copy, retry } = refusalOf(result.reason);
        toast.show(retry ? t('chat.composer.refused') : t(copy));
        return false;
      }
      return true;
    },
    [send, toast, t],
  );

  const mentionable: Mentionable[] = useMemo(
    () =>
      (state?.members ?? [])
        .filter((m) => m.name !== null)
        .map((m) => ({ person: m.person, name: m.name ?? '', dozing: false })),
    [state],
  );

  const sendText = useCallback(
    async (text: string, replyTo: number | null) => {
      const mentions = mentionsIn(text, mentionable).filter((p) => p !== me);
      const url = mentions.length === 0 ? firstUrl(text) : null;
      const reply = replyTo === null ? {} : { replyTo };
      if (url) {
        // The preview is fetched here, on the sender's phone; the message goes without one if slow.
        const preview = await fetchPreview(url, PREVIEW_WAIT_MS);
        const words = text.trim() === url ? {} : { text };
        return write('link', { url, ...words, ...(preview ? { preview } : {}), ...reply });
      }
      return write('message', { text, ...reply, ...(mentions.length > 0 ? { mentions } : {}) });
    },
    [mentionable, me, write],
  );

  const actions = useMemo(
    () => ({
      sendText,
      edit: (target: number, text: string) => write('edit', { target, text }),
      dewdrop: (target?: number) => write('dewdrop', target === undefined ? {} : { target }),
      /** A dewdrop on a message is taken back by unsending it. */
      takeDewBack: (dewSeq: number) => write('unsend', { target: dewSeq }),
      wave: (to: PersonId) => write('wave', { to }),
      retry: async (item: BubbleItem) => {
        const batch = uploadOf(item.opId);
        if (batch !== null) {
          upload.retry(batch);
          return;
        }
        const rejection = refused.find((r) => r.opId === item.opId);
        if (!rejection) return;
        await retryRefused(rejection, {
          write,
          dismiss: () => client.dismissRejection(rejection.opId),
        });
      },
      voice: async (note: Recorded, replyTo: number | null) => {
        try {
          // The queue uploads it (in the background, across restarts) and then sends the note.
          await upload.sendVoice(farm, {
            uri: note.uri,
            durationMs: note.durationMs,
            waveform: note.waveform,
            ...(replyTo === null ? {} : { replyTo }),
          });
          return true;
        } catch {
          toast.show(t('chat.voice.failed'));
          return false;
        }
      },
    }),
    [client, farm, refused, sendText, toast, t, upload, write],
  );

  return {
    state,
    lastSeq: replica?.lastSeq ?? 0,
    me,
    events,
    timeline,
    people,
    bubbles,
    presence,
    link,
    now,
    older,
    loadOlder,
    actions,
    mentionable,
    client,
  };
}
