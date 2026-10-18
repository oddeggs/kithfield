/** The four tabs, by route name. */
export const tabs = ['farm', 'chat', 'seedbed', 'you'] as const;
export type TabName = (typeof tabs)[number];

/** A navigator's state as the tab bar reads it: complete, or partial while a link is restored. */
export interface NavState {
  readonly index?: number;
  readonly routes: readonly object[];
}

/** A route's own navigator state, once it has one (a tab's stack). */
const nestedOf = (route: object | undefined): NavState | undefined =>
  route && 'state' in route ? (route.state as NavState | undefined) : undefined;

/**
 * Whether the tab bar steps aside: the focused tab's own stack has a screen pushed over its first
 * (a plan, a chat, settings). Read from the navigation state alone, so a sheet or cover opened
 * over that pushed screen leaves the bar hidden, and going back to the tab's first screen brings
 * it back. A partial state (a link being opened) has its last route on top.
 */
export function tabBarHidden(state: NavState): boolean {
  const stack = nestedOf(state.routes[state.index ?? state.routes.length - 1]);
  if (!stack) return false;
  return (stack.index ?? stack.routes.length - 1) > 0;
}
