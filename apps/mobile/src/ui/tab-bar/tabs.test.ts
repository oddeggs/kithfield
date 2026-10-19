import { describe, expect, it } from '@jest/globals';

import { tabBarHidden } from './tabs';

/** The tabs' state with `farm` focused and its stack holding `screens`. */
const tabs = (screens: number, index = screens - 1) => ({
  index: 0,
  routes: [
    { state: { index, routes: Array.from({ length: screens }, () => ({})) } },
    { state: { index: 0, routes: [{}] } },
  ],
});

describe('the tab bar over a pushed screen', () => {
  it('shows on a tab’s first screen, and before its stack has any state', () => {
    expect(tabBarHidden(tabs(1))).toBe(false);
    expect(tabBarHidden({ index: 0, routes: [{}, {}] })).toBe(false);
  });

  it('hides while the focused tab has a screen pushed over its first', () => {
    expect(tabBarHidden(tabs(2))).toBe(true);
    expect(tabBarHidden(tabs(3))).toBe(true);
  });

  it('comes back once the tab is back on its first screen', () => {
    expect(tabBarHidden(tabs(2, 0))).toBe(false);
  });

  it('reads only the focused tab', () => {
    const state = tabs(2);
    expect(tabBarHidden({ ...state, index: 1 })).toBe(false);
  });

  it('reads a partial state, as a link restores it, with its last route on top', () => {
    expect(tabBarHidden({ routes: [{ state: { routes: [{}, {}] } }] })).toBe(true);
    expect(tabBarHidden({ routes: [{ state: { routes: [{}] } }] })).toBe(false);
  });

  it('hides over a chat pushed from another tab, whose stack starts at the chat', () => {
    const farm = { name: 'farm', state: { index: 0, routes: [{ name: 'index' }] } };
    const chat = { name: 'chat', state: { index: 0, routes: [{ name: '[farm]' }] } };
    expect(tabBarHidden({ index: 1, routes: [farm, chat] })).toBe(true);
    expect(tabBarHidden({ index: 0, routes: [farm, chat] })).toBe(false);
  });

  it('hides over a pushed screen the tab’s stack has not taken in yet', () => {
    const chat = (screen: string) => ({ name: 'chat', params: { screen, params: { farm: 'f' } } });
    expect(tabBarHidden({ index: 0, routes: [chat('[farm]')] })).toBe(true);
    expect(tabBarHidden({ index: 0, routes: [chat('index')] })).toBe(false);
  });

  it('shows on a tab’s first screen named in its stack', () => {
    const chat = { name: 'chat', state: { routes: [{ name: 'index' }] } };
    expect(tabBarHidden({ routes: [chat] })).toBe(false);
  });
});
