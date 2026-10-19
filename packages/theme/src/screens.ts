/**
 * Larger screens (`design/14 Platforms.dc.html`): where the app stops being one phone-wide column,
 * and the sizes of the panes it shows instead. All values are points.
 */

export const screens = {
  /**
   * From this window width an iPad shows two columns (farms and visits | chat). Narrower windows
   * (Slide Over, a third of a Split View) are the phone layout.
   */
  regularMin: 600,
  /**
   * From this window width an iPad gives the live farm its own column (farms and visits | chat |
   * live farm); Stage Manager windows reflow at the same width.
   */
  wideMin: 900,
  /** Farms and visits, the leading column. */
  sidebar: 270,
  /** The live farm, the trailing column. */
  farmPane: 380,
  /** The chat's flat header in a pane, over a hairline. */
  paneHeader: 58,
  /** The chat floating at the side of the large-screen farm. */
  floatingChat: {
    width: 380,
    side: 24,
    top: 110,
    bottom: 30,
    radius: 32,
    shadow: '0 20px 50px -20px rgba(40,25,10,.45)',
  },
  /** The glass chips along the bottom of the large-screen farm. */
  farmChips: { height: 48, side: 24, bottom: 30, gap: 10, icon: 26 },
  /** The farm's name pill on the large-screen farm sits this far down. */
  farmPillTop: 40,
  /** The note at the foot of the live farm column. */
  farmNote: { inset: 12, radius: 18, blur: 16 },
  /**
   * An iPad window that doesn't fill the screen wears its window controls over the top of the
   * leading pane; the pane's first row starts this much lower there.
   */
  windowControls: 30,
  /** The tab bar keeps a phone's width, centred, on a wider window. */
  tabBarMaxWidth: 393,
  /**
   * A foldable keeps its system controls in a rail down the window's trailing side; the tab bar
   * stands upright in it (the vertical-controls pattern) once the rail is at least `minInset` wide.
   */
  rail: { minInset: 60, width: 62, item: 50, bottom: 18 },
  /** On a foldable, the band either side of the fold that bubbles and the composer keep clear of. */
  foldClearance: 24,
  /** The sidebar's own type, as drawn (system face). */
  sidebarType: {
    name: { size: 14, lineHeight: 17, weight: '600' },
    line: { size: 12.5, lineHeight: 16 },
    search: { size: 13, height: 32, radius: 10 },
    keycap: { size: 12, height: 22, radius: 6 },
    footerName: { size: 13.5, lineHeight: 16 },
    footerLine: { size: 12, lineHeight: 14 },
  },
  /** A sidebar row: its art, padding and the selected row's corner. */
  sidebarRow: { art: 40, artRadius: 12, visitAvatar: 28, padV: 8, padH: 10, radius: 14, gap: 10 },
} as const;
