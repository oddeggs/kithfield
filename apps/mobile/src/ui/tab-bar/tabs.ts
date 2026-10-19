/** The four tabs, by route name. */
export const tabs = ['farm', 'chat', 'seedbed', 'you'] as const;
export type TabName = (typeof tabs)[number];

/** A navigator's state as the tab bar reads it: complete, or partial while a link is restored. */
export interface NavState {
  readonly index?: number;
  readonly routes: readonly object[];
}

/** The screen each tab's stack starts on. */
const FIRST_SCREEN = 'index';

/** The route on top of a navigator: its focused one, or the last one of a partial state. */
const topOf = (state: NavState): object | undefined =>
  state.routes[state.index ?? state.routes.length - 1];

/** A route's own navigator state, once it has one (a tab's stack). */
const nestedOf = (route: object): NavState | undefined =>
  'state' in route ? (route.state as NavState | undefined) : undefined;

const nameOf = (route: object | undefined): unknown =>
  route && 'name' in route ? route.name : undefined;

/** The screen a navigation asked the tab's stack for, before the stack has state of its own. */
const askedFor = (route: object): unknown =>
  'params' in route ? (route.params as { screen?: unknown } | undefined)?.screen : undefined;

/**
 * Whether the tab bar steps aside: the focused tab's own stack shows a screen other than its first
 * (a plan, a chat, settings). Read from the navigation state alone, so a sheet or cover opened
 * over that screen leaves the bar hidden, and going back to the tab's first screen brings it
 * back. A partial state (a link being opened) has its last route on top. A screen opened from
 * another tab can start the tab's stack by itself, with nothing under it, so the screen's name
 * counts as well as its depth; and a stack not made yet is read from the screen it was asked for.
 */
export function tabBarHidden(state: NavState): boolean {
  const tab = topOf(state);
  if (!tab) return false;
  const stack = nestedOf(tab);
  if (!stack) {
    const screen = askedFor(tab);
    return typeof screen === 'string' && screen !== FIRST_SCREEN;
  }
  if ((stack.index ?? stack.routes.length - 1) > 0) return true;
  const name = nameOf(topOf(stack));
  return typeof name === 'string' && name !== FIRST_SCREEN;
}
