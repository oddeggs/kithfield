import { router, type Href } from 'expo-router';

/**
 * Links to routes, gestures' own and other features'. Other features' routes are named by the
 * cross-feature route table and may not exist in every build yet, so they're built as plain paths.
 */
const href = (path: string, params: Record<string, string | number | undefined>): Href => {
  const query = Object.entries(params)
    .filter((e): e is [string, string | number] => e[1] !== undefined)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return (query ? `${path}?${query}` : path) as Href;
};

export const routes = {
  firefly: (farm: string, to?: string) => href('/gestures-firefly', { farm, to }),
  knock: (farm: string, to?: string) => href('/gestures-knock', { farm, to }),
  slowPost: (farm: string, to?: string) => href('/gestures-slow-post', { farm, to }),
  weather: (farm: string, to: string) => href('/gestures-weather', { farm, to }),
  reactions: (farm: string, seq: number) => href('/gestures-reactions', { farm, seq }),
  forward: (farm: string, seq: number) => href('/gestures-forward', { farm, seq }),
  attach: (farm: string) => href('/gestures-attach', { farm }),
  /** Planting a plan, from a message or from nothing (the plans feature). */
  plant: (farm: string, fromSeq?: number) => href('/plans-plant', { farm, fromSeq }),
  /** Reporting a message (the safety feature). */
  report: (farm: string, seq: number) => href('/safety-report', { farm, seq }),
  /** The farm's chat, replying to a message (the chat feature reads `replyTo`). */
  reply: (farm: string, seq: number) => href(`/chat/${encodeURIComponent(farm)}`, { replyTo: seq }),
  /** The farm's chat at a message. */
  chatAt: (farm: string, seq?: number) => href(`/chat/${encodeURIComponent(farm)}`, { seq }),
  farm: () => '/farm' as Href,
};

export const open = (to: Href): void => router.push(to);
