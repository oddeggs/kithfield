import { sizes } from '@kithfield/theme';

import { tabBarFrame } from '../tab-bar/tab-bar';
import { tabItemFrame } from '../tab-bar/tab-bar-view';
import { tabs, type TabName } from '../tab-bar/tabs';
import type { Box } from './geometry';

/** The icon of `tab` on a `width`×`height` window with `bottomInset` under it, as a box. */
export function tabIconBox(tab: TabName, width: number, height: number, bottomInset: number): Box {
  const { side, liftUnderIndicator, bottomWithoutIndicator } = tabBarFrame;
  const { padding, icon, labelAndGap } = tabItemFrame;
  const bottom = bottomInset > 0 ? bottomInset - liftUnderIndicator : bottomWithoutIndicator;
  const item = (width - side * 2 - padding * 2) / tabs.length;
  const cx = side + padding + item * (tabs.indexOf(tab) + 0.5);
  const cy = height - bottom - sizes.tabBar / 2 - labelAndGap / 2;
  return { x: cx - icon / 2, y: cy - icon / 2, width: icon, height: icon };
}
