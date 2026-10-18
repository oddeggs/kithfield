import { router } from 'expo-router';

/* Where the chat links to: its own screens and other features' (the message menu, the + tray, a
 * critter's card, planting a plan, a new farm), each by the route's own typed path. */

export const go = {
  chat: (farm: string, params: Record<string, string> = {}) =>
    router.push({ pathname: '/(tabs)/chat/[farm]', params: { ...params, farm } }),
  /** Back to a chat already open, with params for it (start a reply). */
  chatWith: (farm: string, params: Record<string, string>) =>
    router.navigate({ pathname: '/(tabs)/chat/[farm]', params: { ...params, farm } }),
  chatList: () => router.navigate('/(tabs)/chat'),
  search: (farm: string | undefined) =>
    router.push({ pathname: '/(cover)/chat-search', params: farm ? { farm } : {} }),
  viewer: (farm: string, seq: number, index: number) =>
    router.push({
      pathname: '/(cover)/chat-viewer',
      params: { farm, seq: String(seq), index: String(index) },
    }),
  media: (farm: string) => router.push({ pathname: '/(tabs)/chat/media', params: { farm } }),
  /** `top`: the bubble's top on screen, so the menu lifts it from where it is. */
  messageMenu: (farm: string, seq: number, top: number | null) =>
    router.push({
      pathname: '/(modal)/gestures-message',
      params: {
        farm,
        seq: String(seq),
        ...(top === null ? {} : { top: String(Math.round(top)) }),
      },
    }),
  tray: (farm: string) => router.push({ pathname: '/(modal)/gestures-tray', params: { farm } }),
  /** The Farm tab, where a critter travelling from the chat lands. */
  farm: () => router.navigate('/(tabs)/farm'),
  critter: (farm: string, person: string) =>
    router.push({ pathname: '/(modal)/farm-critter', params: { farm, person } }),
  plantPlan: (farm: string, fromSeq: number) =>
    router.push({ pathname: '/(modal)/plans-plant', params: { farm, fromSeq: String(fromSeq) } }),
  newFarm: () => router.push('/(modal)/farm-new'),
  seedBed: () => router.navigate('/(tabs)/seedbed'),
  forward: (farm: string, seq: number) =>
    router.push({ pathname: '/(modal)/gestures-forward', params: { farm, seq: String(seq) } }),
};
