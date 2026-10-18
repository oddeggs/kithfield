import { router, type Href } from 'expo-router';

/*
 * Where the chat links to. Some of these routes belong to other features and are built beside this
 * one (the message menu, the + tray, a critter's card, planting a plan, a new farm); until they
 * land, Expo Router shows its not-found screen for them.
 */

const href = (pathname: string, params?: Record<string, string>): Href =>
  (params ? { pathname, params } : pathname) as unknown as Href;

export const go = {
  chat: (farm: string, params: Record<string, string> = {}) =>
    router.push(href('/(tabs)/chat/[farm]', { farm, ...params })),
  /** Back to a chat already open, with params for it (start a reply). */
  chatWith: (farm: string, params: Record<string, string>) =>
    router.navigate(href('/(tabs)/chat/[farm]', { farm, ...params })),
  chatList: () => router.navigate(href('/(tabs)/chat')),
  search: (farm: string | undefined) =>
    router.push(href('/(cover)/chat-search', farm ? { farm } : {})),
  viewer: (farm: string, seq: number, index: number) =>
    router.push(href('/(cover)/chat-viewer', { farm, seq: String(seq), index: String(index) })),
  media: (farm: string) => router.push(href('/(tabs)/chat/media', { farm })),
  /** `top`: the bubble's top on screen, so the menu lifts it from where it is. */
  messageMenu: (farm: string, seq: number, top: number | null) =>
    router.push(
      href('/(modal)/gestures-message', {
        farm,
        seq: String(seq),
        ...(top === null ? {} : { top: String(Math.round(top)) }),
      }),
    ),
  tray: (farm: string) => router.push(href('/(modal)/gestures-tray', { farm })),
  critter: (farm: string, person: string) =>
    router.push(href('/(modal)/farm-critter', { farm, person })),
  plantPlan: (farm: string, fromSeq: number) =>
    router.push(href('/(modal)/plans-plant', { farm, fromSeq: String(fromSeq) })),
  newFarm: () => router.push(href('/(modal)/farm-new')),
  seedBed: () => router.navigate(href('/(tabs)/seedbed')),
  forward: (farm: string, seq: number) =>
    router.push(href('/(modal)/gestures-forward', { farm, seq: String(seq) })),
};
