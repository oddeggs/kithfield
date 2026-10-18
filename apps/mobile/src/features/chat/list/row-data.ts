import { isTombstone, type ChatListItem, type PersonId, type Season } from '@kithfield/contracts';
import { useCallback, useEffect, useState } from 'react';

import {
  kithfieldRules,
  useDataClient,
  useFarmSelector,
  type FarmReplicaState,
} from '../../../data';
import { useLocale } from '../../../ui/locale/locale-provider';
import { isNews, speakerOf, whatOf, type RowEvent } from '../model/chat-list';
import { isBubbleKind } from '../model/timeline';

/** What a chat-list row needs from the farm as this phone holds it. */
export interface RowFacts {
  readonly season: Season;
  /** Nobody has opened the farm for a fortnight: everyone's dozing. */
  readonly misty: boolean;
  /** Names by person, members and former members. */
  readonly names: Readonly<Record<string, string | null>>;
}

const same = (a: RowFacts, b: RowFacts) =>
  a.season === b.season &&
  a.misty === b.misty &&
  JSON.stringify(a.names) === JSON.stringify(b.names);

export function useRowFacts(farm: string, now: number): RowFacts {
  const select = useCallback(
    (r: FarmReplicaState | null): RowFacts => {
      const state = r?.state ?? null;
      const names: Record<string, string | null> = {};
      for (const f of state?.former ?? []) names[f.person] = f.name;
      for (const m of state?.members ?? []) names[m.person] = m.name;
      for (const [from, into] of Object.entries(state?.aliases ?? {}))
        names[from] = names[into] ?? null;
      const misty = (() => {
        try {
          return state ? kithfieldRules.farmView(state, now).misty : false;
        } catch {
          return false;
        }
      })();
      return { season: state?.season.season ?? 'spring', misty, names };
    },
    [now],
  );
  return useFarmSelector(farm, select, same);
}

const textOf = (payload: unknown): string | null => {
  const p =
    typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>) : {};
  const text = p['text'] ?? p['caption'] ?? p['title'];
  return typeof text === 'string' && text.trim() !== '' ? text.replace(/\s+/g, ' ').trim() : null;
};

/** The event a row's line is about: the row's own, or the latest news this phone holds. */
interface LineSource {
  readonly kind: string;
  readonly actor: PersonId | null;
  readonly preview: string | null;
  readonly event: RowEvent | null;
}

function useLineSource(row: ChatListItem): LineSource {
  const client = useDataClient();
  const [source, setSource] = useState<LineSource>({
    kind: row.kind,
    actor: row.actor,
    preview: row.preview,
    event: null,
  });
  useEffect(() => {
    let live = true;
    const own: LineSource = { kind: row.kind, actor: row.actor, preview: row.preview, event: null };
    setSource(own);
    const find = async (): Promise<LineSource> => {
      if (isNews(row.kind)) {
        if (row.preview !== null && isBubbleKind(row.kind)) return own;
        const event = await client.store.event(row.farm, row.seq);
        return { ...own, event: event ? { kind: event.kind, payload: event.payload } : null };
      }
      // The row's latest event is quiet (someone opened the farm): say the last news instead.
      const recent = await client.events(row.farm, { limit: 40 });
      const last = [...recent]
        .reverse()
        .find((e) => e.known && isNews(e.kind) && e.kind !== 'joined' && !isTombstone(e.payload));
      if (!last) return own;
      return {
        kind: last.kind,
        actor: last.actor,
        preview: textOf(last.payload),
        event: { kind: last.kind, payload: last.payload },
      };
    };
    find().then(
      (s) => live && setSource(s),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [client, row.farm, row.seq, row.kind, row.actor, row.preview]);
  return source;
}

/** The line under a row's name: who said what, in plain words; a visit says whose porch. */
export function useRowLine(row: ChatListItem, facts: RowFacts, me: PersonId | null): string {
  const { t } = useLocale();
  const source = useLineSource(row);
  if (row.farmKind === 'farm' && facts.misty) return t('chat.list.dozing');
  const nameOf = (person: PersonId): string | null =>
    person === row.with?.person
      ? (row.with.name ?? t('chat.friendWhoLeft'))
      : (facts.names[person] ?? null);
  const speaker = speakerOf(source.actor, me, nameOf);
  const what = (() => {
    const words = source.preview ?? textOf(source.event?.payload);
    if (words !== null && source.kind !== 'voice') return { words, quoted: true };
    const w = whatOf(source.kind, source.event);
    const text =
      w.key === 'voice'
        ? t('chat.what.voice', { duration: w.duration ?? '' })
        : t(`chat.what.${w.key}`);
    return { words: text, quoted: false };
  })();
  if (row.farmKind === 'visit') {
    const peer = row.with?.name ?? t('chat.friendWhoLeft');
    if (speaker.kind === 'you') {
      return `${t('chat.list.onYourPorch')} · ${t('chat.list.yours', { text: what.words })}`;
    }
    const said = what.quoted ? t('chat.list.quoted', { text: what.words }) : what.words;
    return `${t('chat.list.onTheirPorch', { name: peer })} · ${said}`;
  }
  if (speaker.kind === 'you') return t('chat.list.yours', { text: what.words });
  if (speaker.kind === 'friend')
    return t('chat.list.theirs', { name: speaker.name, text: what.words });
  return what.words;
}
