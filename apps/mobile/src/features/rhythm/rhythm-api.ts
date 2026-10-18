import {
  CommandResult,
  FarmGate,
  GateList,
  type GateGesture,
  type FarmId,
  type Lang,
  type LocalDate,
  type OpId,
  type PersonId,
  ScrapbookList,
  type Seq,
  type TradeRequest,
  WeatherAttribution,
  WeeklyRecap,
} from '@kithfield/contracts';
import { useEffect, useMemo, useState } from 'react';

import { useDataClient, type ApiClient } from '../../data';

/* The rhythm's calls to the API: the recap, the scrapbook, friends' gates, trades, the weather. */

const farmPath = (farm: FarmId) => `/v1/farms/${encodeURIComponent(farm)}`;

export function rhythmApi(api: ApiClient) {
  return {
    recap: (farm: FarmId, week?: LocalDate) =>
      api.request(WeeklyRecap, 'GET', `${farmPath(farm)}/recap${week ? `?week=${week}` : ''}`),
    scrapbook: (farm: FarmId, before?: Seq) =>
      api.request(
        ScrapbookList,
        'GET',
        `${farmPath(farm)}/scrapbook${before === undefined ? '' : `?before=${before}`}`,
      ),
    gates: (person?: PersonId) =>
      api.request(
        GateList,
        'GET',
        `/v1/gates${person ? `?person=${encodeURIComponent(person)}` : ''}`,
      ),
    gate: (farm: FarmId) => api.request(FarmGate, 'GET', `${farmPath(farm)}/gate`),
    atGate: (farm: FarmId, opId: OpId, gesture: GateGesture) =>
      api.request(CommandResult, 'POST', `${farmPath(farm)}/gate`, { opId, gesture }),
    trade: (visited: FarmId, trade: TradeRequest) =>
      api.request(CommandResult, 'POST', `${farmPath(visited)}/trade`, trade),
    attribution: (source: string, lang: Lang) =>
      api.request(
        WeatherAttribution,
        'GET',
        `/v1/weather/attribution?source=${encodeURIComponent(source)}&lang=${lang}`,
      ),
  };
}

export type RhythmApi = ReturnType<typeof rhythmApi>;

export function useRhythmApi(): RhythmApi {
  const { api } = useDataClient();
  return useMemo(() => rhythmApi(api), [api]);
}

/** One answer from the API, read when the screen opens and again on `reload`. */
export type Loaded<T> =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly value: T }
  | { readonly status: 'failed'; readonly error: unknown };

export function useLoad<T>(
  load: (() => Promise<T>) | null,
  deps: readonly unknown[],
): Loaded<T> & { reload: () => void } {
  const [state, setState] = useState<Loaded<T>>({ status: 'loading' });
  const [round, setRound] = useState(0);
  useEffect(() => {
    if (!load) return;
    let live = true;
    setState((s) => (s.status === 'ready' ? s : { status: 'loading' }));
    load().then(
      (value) => live && setState({ status: 'ready', value }),
      (error: unknown) => live && setState({ status: 'failed', error }),
    );
    return () => {
      live = false;
    };
    // The caller names what the load depends on.
  }, [...deps, round]);
  return { ...state, reload: () => setRound((r) => r + 1) };
}
