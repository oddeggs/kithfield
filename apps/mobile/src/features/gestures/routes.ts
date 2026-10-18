import { router, type Href } from 'expo-router';

/** Links to routes, gestures' own and other features', each by the route's own typed path. */

type Params = Record<string, string | number | undefined>;

/** The params that are set, as strings. */
const given = (params: Params): Record<string, string> =>
  Object.fromEntries(
    Object.entries(params)
      .filter((e): e is [string, string | number] => e[1] !== undefined)
      .map(([k, v]) => [k, String(v)]),
  );

export const routes = {
  firefly: (farm: string, to?: string): Href => ({
    pathname: '/(modal)/gestures-firefly',
    params: given({ farm, to }),
  }),
  knock: (farm: string, to?: string): Href => ({
    pathname: '/(modal)/gestures-knock',
    params: given({ farm, to }),
  }),
  slowPost: (farm: string, to?: string): Href => ({
    pathname: '/(modal)/gestures-slow-post',
    params: given({ farm, to }),
  }),
  weather: (farm: string, to: string): Href => ({
    pathname: '/(modal)/gestures-weather',
    params: { farm, to },
  }),
  reactions: (farm: string, seq: number): Href => ({
    pathname: '/(modal)/gestures-reactions',
    params: { farm, seq: String(seq) },
  }),
  forward: (farm: string, seq: number): Href => ({
    pathname: '/(modal)/gestures-forward',
    params: { farm, seq: String(seq) },
  }),
  attach: (farm: string): Href => ({ pathname: '/(modal)/gestures-attach', params: { farm } }),
  /** Planting a plan, from a message or from nothing (the plans feature). */
  plant: (farm: string, fromSeq?: number): Href => ({
    pathname: '/(modal)/plans-plant',
    params: given({ farm, fromSeq }),
  }),
  /** Reporting a message (the safety feature). */
  report: (farm: string, seq: number): Href => ({
    pathname: '/(modal)/safety-report',
    params: { farm, seq: String(seq) },
  }),
  /** The farm's chat, replying to a message (the chat feature reads `replyTo`). */
  reply: (farm: string, seq: number): Href => ({
    pathname: '/(tabs)/chat/[farm]',
    params: { farm, replyTo: String(seq) },
  }),
  /** The farm's chat at a message. */
  chatAt: (farm: string, seq?: number): Href => ({
    pathname: '/(tabs)/chat/[farm]',
    params: { farm, ...(seq === undefined ? {} : { seq: String(seq) }) },
  }),
  farm: (): Href => '/(tabs)/farm',
};

export const open = (to: Href): void => router.push(to);
