import { isTombstone, type FarmState, type MediaRef } from '@kithfield/contracts';
import { useEffect, useRef, useState } from 'react';

import { useDataClient } from '../../../data';
import { chatApi } from '../api/chat-api';
import { localHits, mergeHits, type Hit } from '../model/search';

const DEBOUNCE_MS = 250;
const LOCAL_LIMIT = 2000;

export type SearchState =
  | { readonly status: 'idle' }
  | { readonly status: 'looking'; readonly hits: readonly Hit[] }
  | { readonly status: 'done'; readonly hits: readonly Hit[]; readonly offline: boolean };

/**
 * Searches one farm, or every farm, as the words change: this phone's cache answers at once and
 * the farms' own search fills in. Offline, the phone's answer stands.
 */
export function useSearch(farms: readonly string[], query: string): SearchState {
  const client = useDataClient();
  const [state, setState] = useState<SearchState>({ status: 'idle' });
  const run = useRef(0);
  const key = farms.join(',');
  useEffect(() => {
    const q = query.trim();
    if (q === '') {
      setState({ status: 'idle' });
      return;
    }
    const id = (run.current += 1);
    const timer = setTimeout(() => {
      void (async () => {
        const local = (
          await Promise.all(
            farms.map(async (farm) =>
              localHits(farm, await client.events(farm, { limit: LOCAL_LIMIT }), q),
            ),
          )
        ).flat();
        if (id !== run.current) return;
        setState({ status: 'looking', hits: mergeHits([], local) });
        let offline = false;
        const server = (
          await Promise.all(
            farms.map(async (farm) => {
              try {
                const { results } = await chatApi.search(farm, q);
                return results.map((r) => ({
                  farm,
                  seq: r.seq,
                  at: r.at,
                  actor: r.actor,
                  kind: r.kind,
                  text: r.snippet,
                }));
              } catch {
                offline = true;
                return [];
              }
            }),
          )
        ).flat();
        if (id !== run.current) return;
        setState({ status: 'done', hits: mergeHits(server, local), offline });
      })();
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [client, key, query]);
  return state;
}

/** The farms' states, for names, critters and the person filter. */
export function useFarmStates(
  farms: readonly string[],
): Readonly<Record<string, FarmState | null>> {
  const client = useDataClient();
  const [states, setStates] = useState<Record<string, FarmState | null>>({});
  const key = farms.join(',');
  useEffect(() => {
    let live = true;
    void Promise.all(
      farms.map(async (farm) => [farm, (await client.replica(farm)).getState().state] as const),
    ).then((pairs) => live && setStates(Object.fromEntries(pairs)));
    return () => {
      live = false;
    };
  }, [client, key]);
  return states;
}

/** The photos a media hit carries, from the phone's cache or a page of the farm's log. */
export function useHitMedia(hits: readonly Hit[]): Readonly<Record<string, readonly MediaRef[]>> {
  const client = useDataClient();
  const [media, setMedia] = useState<Record<string, readonly MediaRef[]>>({});
  const key = hits.map((h) => `${h.farm}:${h.seq}`).join(',');
  useEffect(() => {
    let live = true;
    void Promise.all(
      hits.map(async (h) => {
        let event: { payload: unknown } | null = await client.store.event(h.farm, h.seq);
        if (!event) {
          const page = await client.api
            .events(h.farm, { after: h.seq - 1, limit: 1 })
            .catch(() => null);
          const raw = page?.events[0] as { seq?: number; payload?: unknown } | undefined;
          event = raw?.seq === h.seq ? { payload: raw.payload } : null;
        }
        const p = event?.payload;
        const items =
          p &&
          !isTombstone(p) &&
          typeof p === 'object' &&
          Array.isArray((p as { items?: unknown }).items)
            ? (p as { items: MediaRef[] }).items
            : [];
        return [`${h.farm}:${h.seq}`, items] as const;
      }),
    ).then((pairs) => live && setMedia(Object.fromEntries(pairs)));
    return () => {
      live = false;
    };
  }, [client, key]);
  return media;
}
