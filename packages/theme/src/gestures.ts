import { day, night, type Appearance } from './colour';

/**
 * The colours `05 Gestures` writes inline, by job, in each appearance. Day values are the
 * design's own; night values follow the night palette where the design draws no night.
 */
export interface GestureColours {
  /** Glass over a night scene (fireflies, the slow post path, a window at night). */
  glassNight: { fill: string; border: string; ink: string };
  /** Glass over a day scene (heavy weather). */
  glassDay: { fill: string; border: string; ink: string };
  /** Hand-lettered words drawn over a night scene ("knock knock"). */
  onNightArt: string;
  /** Hand-lettered words drawn over a day scene (what a friend says under their cloud). */
  onDayArt: string;
  /** Under the + tray, the reactions sheet and the attach sheet: at `scrimOpacity`. */
  scrim: string;
  scrimOpacity: number;
  /** Over the blurred chat under the long-press menu. */
  menuTint: string;
  /** The long-press menu and reaction tray, over the blur. */
  menuSurface: string;
  menuShadow: string;
  /** The message lifted under the menu. */
  liftShadow: string;
  /** The moss panels: "Plant a seed" in the tray and the forwarding note. */
  mossPanel: string;
  mossPanelText: string;
  mossPanelChevron: string;
  /** Quick Tend's bouquet card. */
  bouquet: string;
  /** A row's unpicked circle in forwarding, and the tick on a picked one. */
  pickRing: string;
  pickTick: string;
  /** The empty part of a file's upload bar on its bubble. */
  progressTrack: string;
}

const dayColours: GestureColours = {
  glassNight: { fill: 'rgba(30,32,56,.5)', border: 'rgba(255,255,255,.14)', ink: night.moon },
  glassDay: { fill: 'rgba(251,247,240,.78)', border: 'rgba(255,255,255,.6)', ink: day.ink },
  onNightArt: '#f6eedb',
  onDayArt: day.ink2,
  scrim: day.ink,
  scrimOpacity: 0.3,
  menuTint: 'rgba(42,34,29,.22)',
  menuSurface: 'rgba(251,247,240,.94)',
  menuShadow: '0 14px 40px -12px rgba(40,25,10,.45)',
  liftShadow: '0 14px 34px -14px rgba(40,25,10,.5)',
  mossPanel: day.mossTint,
  mossPanelText: '#4d5a41',
  mossPanelChevron: '#6f7d62',
  bouquet: '#F3E7CC',
  pickRing: 'rgba(42,34,29,.3)',
  pickTick: '#ffffff',
  progressTrack: 'rgba(255,255,255,.3)',
};

const nightColours: GestureColours = {
  // Scenes keep their own light: glass and hand lettering over art are the same at night.
  glassNight: dayColours.glassNight,
  glassDay: dayColours.glassDay,
  onNightArt: dayColours.onNightArt,
  // The heavy-weather scene is drawn by day whatever the hour, so its words stay dark.
  onDayArt: dayColours.onDayArt,
  scrim: '#000000',
  scrimOpacity: 0.3,
  menuTint: 'rgba(0,0,0,.3)',
  menuSurface: night.bubble,
  menuShadow: '0 14px 40px -12px rgba(0,0,0,.6)',
  liftShadow: '0 14px 34px -14px rgba(0,0,0,.6)',
  mossPanel: 'rgba(169,196,142,.16)',
  mossPanelText: night.moon2,
  mossPanelChevron: night.dim,
  bouquet: '#34385a',
  pickRing: 'rgba(255,255,255,.3)',
  pickTick: '#ffffff',
  progressTrack: 'rgba(255,255,255,.3)',
};

export const gestureColours: Readonly<Record<Appearance, GestureColours>> = {
  day: dayColours,
  night: nightColours,
};

/** The motion `05 Gestures` names in its notes for the developer. */
export const gestureMotion = {
  /** A knock wobbles the window: 3 swings of ±4° over 600 ms. */
  knockWobble: { swings: 3, degrees: 4, durationMs: 600 },
  /** A firefly drifts along a curve to the door over 1.2 s. */
  fireflyFlightMs: 1200,
  /** The + tray's cards come in 40 ms apart. */
  trayStaggerMs: 40,
  /** The long-press menu: the bubble lifts to 1.04, the tray grows from 0.9, the chat blurs 12 px. */
  menuLift: 1.04,
  menuTrayFrom: 0.9,
  menuBlurPx: 12,
  /** A chosen reaction pops to 1.12. */
  reactionPop: 1.12,
  /** A sent Quick Tend card fades to 72%. */
  sentCardOpacity: 0.72,
} as const;
