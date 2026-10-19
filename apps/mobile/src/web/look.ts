import { day } from '@kithfield/theme';

/**
 * The web and desktop's own measures from `design/14 Platforms.dc.html` (the screens and their
 * developer notes) that the theme has no token for. Everything else comes from the theme.
 */
export const platformLook = {
  /** "The saved cottage glows on a 1.6s pulse until you move in." */
  savedPulseMs: 1600,
  /** "Tray glow breathes over 2.4s while a firefly waits." */
  trayBreathMs: 2400,
  /** "Drop zone fades in at 120ms", "cross-fade 120ms". */
  quickFadeMs: 120,
  /** "Pane swap cross-fades 200ms." */
  paneSwapMs: 200,
  /** The saved cottage's ring and its light. */
  glowRing: 'rgba(255,250,242,0.95)',
  glowLight: 'rgba(255,214,120,0.8)',
  /** The farm chip over the art. */
  chipOverArt: 'rgba(251,247,240,0.86)',
  /** The join panel beside the farm. */
  panelWidth: 400,
  panelPadding: 28,
  /** Under this the web uses the phone's layout; from `wide` up, the three panes. */
  narrow: 600,
  wide: 1100,
  /** The three panes: the farms list and the live farm, the chat between. */
  listWidth: 270,
  farmWidth: 360,
  /** The drop zone's dashed edge and wash. */
  dropEdge: day.moss,
  dropWash: 'rgba(230,237,216,0.55)',
} as const;
