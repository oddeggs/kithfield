/**
 * The web and desktop's own layout measures from `design/14 Platforms.dc.html` (the screens and
 * their developer notes) that the theme has no token for. Their timings and colours are the
 * theme's (`platformMotion`, `platformColour`).
 */
export const platformLook = {
  /** The join panel beside the farm. */
  panelWidth: 400,
  panelPadding: 28,
  /** Under this the web uses the phone's layout; from `wide` up, the three panes. */
  narrow: 600,
  wide: 1100,
  /** The three panes: the farms list and the live farm, the chat between. */
  listWidth: 270,
  farmWidth: 360,
} as const;
