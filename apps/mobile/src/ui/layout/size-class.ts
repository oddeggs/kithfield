import { screens } from '@kithfield/theme';

/**
 * How the app lays itself out in a window of a given size (`14 Platforms`):
 *
 * - `phone`: one column with the tab bar, as on an iPhone. Also an iPad in Slide Over or a narrow
 *   Split View, and a foldable's outer display.
 * - `columns`: an iPad in portrait or a wide Split View: farms and visits | the chat, with the
 *   farm in the chat's header as on the phone.
 * - `wide`: an iPad in landscape: farms and visits | the chat | the live farm.
 * - `pair`: a foldable opened up (a phone, but wider than tall and past the regular width): the
 *   farm | the chat, side by side either side of the fold.
 */
export type LayoutKind = 'phone' | 'columns' | 'wide' | 'pair';

export interface WindowShape {
  readonly width: number;
  readonly height: number;
  /** An iPad (its own idiom), rather than a phone, whatever the window's size. */
  readonly pad: boolean;
}

export function layoutFor({ width, height, pad }: WindowShape): LayoutKind {
  if (pad) {
    if (width >= screens.wideMin) return 'wide';
    if (width >= screens.regularMin) return 'columns';
    return 'phone';
  }
  return width >= screens.regularMin && width > height ? 'pair' : 'phone';
}

/** Whether a layout shows farms and visits beside the chat, so there is no chat list screen. */
export const hasSidebar = (kind: LayoutKind): boolean => kind === 'columns' || kind === 'wide';

/** Whether the farm has a column of its own beside the chat. */
export const hasFarmPane = (kind: LayoutKind): boolean => kind === 'wide' || kind === 'pair';

/** How wide each pane is in a window `width` points wide; a pane a layout doesn't show is 0. */
export interface PaneWidths {
  readonly leading: number;
  readonly main: number;
  readonly trailing: number;
  /** Clear space at the main pane's leading edge (beside a fold), inside `main`. */
  readonly gutter: number;
}

export function paneWidths(kind: LayoutKind, width: number): PaneWidths {
  switch (kind) {
    case 'phone':
      return { leading: 0, main: width, trailing: 0, gutter: 0 };
    case 'columns':
      return { leading: screens.sidebar, main: width - screens.sidebar, trailing: 0, gutter: 0 };
    case 'wide':
      return {
        leading: screens.sidebar,
        main: width - screens.sidebar - screens.farmPane,
        trailing: screens.farmPane,
        gutter: 0,
      };
    case 'pair': {
      // Equal panes either side of the fold; the chat keeps clear of it.
      const leading = Math.round(width / 2);
      return { leading, main: width - leading, trailing: 0, gutter: screens.foldClearance };
    }
  }
}
