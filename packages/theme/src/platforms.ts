import { day } from './colour';

/**
 * The web and desktop app's own timings, from the developer notes of `14 Platforms` (the theme's
 * `motion` has no token for them).
 */
export const platformMotion = {
  /** "The saved cottage glows on a 1.6s pulse until you move in." */
  savedPulseMs: 1600,
  /** "Tray glow breathes over 2.4s while a firefly waits." */
  trayBreathMs: 2400,
  /** "Drop zone fades in at 120ms", "cross-fade 120ms". */
  quickFadeMs: 120,
  /** "Pane swap cross-fades 200ms." */
  paneSwapMs: 200,
} as const;

/** The web and desktop app's own colours (`14 Platforms`). */
export const platformColour = {
  /** The saved cottage's ring and its light, in the browser's invite. */
  glowRing: 'rgba(255,250,242,0.95)',
  glowLight: 'rgba(255,214,120,0.8)',
  /** The farm chip over the art. */
  chipOverArt: 'rgba(251,247,240,0.86)',
  /** The drop zone's dashed edge and wash. */
  dropEdge: day.moss,
  dropWash: 'rgba(230,237,216,0.55)',
} as const;
