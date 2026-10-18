import { sizes } from '@kithfield/theme';

import { tabs, type TabName } from '../tab-bar/tabs';
import type { Box } from './geometry';

/*
 * Where each tab's icon sits on the window, as the floating tab bar lays it out
 * (`ui/tab-bar/tab-bar.tsx`, `tab-bar-view.tsx`): 16 in from each side, resting on the home
 * indicator, four equal items inside 6 points of padding, the 26-point icon above a 10-point label.
 */
const SIDE = 16;
const LIFT_UNDER_INDICATOR = 8;
const BOTTOM_WITHOUT_INDICATOR = 16;
const INNER = 6;
const ICON = 26;
const LABEL_AND_GAP = 12;

/** The icon of `tab` on a `width`×`height` window with `bottomInset` under it, as a box. */
export function tabIconBox(tab: TabName, width: number, height: number, bottomInset: number): Box {
  const bottom = bottomInset > 0 ? bottomInset - LIFT_UNDER_INDICATOR : BOTTOM_WITHOUT_INDICATOR;
  const item = (width - SIDE * 2 - INNER * 2) / tabs.length;
  const cx = SIDE + INNER + item * (tabs.indexOf(tab) + 0.5);
  const cy = height - bottom - sizes.tabBar / 2 - LABEL_AND_GAP / 2;
  return { x: cx - ICON / 2, y: cy - ICON / 2, width: ICON, height: ICON };
}
