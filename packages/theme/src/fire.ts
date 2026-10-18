import { day, night } from './colour';
import { fireside } from './plans';

/**
 * The fire room's glass and text over the night scene (`16 Fire Room and Calls`). The room is
 * always night, whatever the phone's appearance: named colours come from the palettes, the room's
 * own translucent fills are the design's values.
 */
export const fireRoom = {
  sky: fireside.sky,
  /** Round buttons and the title pill. */
  glass: fireside.glass,
  glassBorder: fireside.glassBorder,
  /** The panel at the bottom. */
  panel: 'rgba(24,26,48,.76)',
  panelBorder: fireside.sheetBorder,
  /** A name chip over a quiet critter. */
  chip: 'rgba(24,26,48,.76)',
  /** A name chip over someone talking: honey, never a glowing ring. */
  talking: day.honey,
  talkingInk: day.ink,
  text: night.moon,
  sub: night.moon2,
  dim: night.dim,
  title: fireside.title,
  eyebrow: day.honey,
  /** The main button; and the quieter one beside it. */
  primary: day.honey,
  primaryInk: day.ink,
  secondary: 'rgba(255,255,255,.12)',
  /** Gesture tiles and the weak-connection note. */
  tile: 'rgba(255,255,255,.1)',
  note: 'rgba(255,255,255,.08)',
  /** "from you" over a gesture, and the lantern welcome line. */
  glyph: '#ffd98a',
  /** The ring round the little critters in the panel. */
  ring: fireside.ring,
  /** Stopping a screen share. */
  stop: day.clay,
  /** A lantern frame's chip, and the screen-share card's ring. */
  card: 'rgba(24,26,48,.82)',
  frameLit: '#c9973e',
  /** A lantern frame's ring while the camera is off. */
  frameDark: '#8a7f9a',
  /** The captions card under the header. */
  captions: 'rgba(20,22,42,.8)',
  captionsBorder: 'rgba(255,255,255,.1)',
  /** The captions sheet's scrim, its grabber and its rows. */
  scrim: 'rgba(10,10,24,.4)',
  grabber: 'rgba(255,255,255,.3)',
  sheet: night.panel,
  sheetShadow: '0 -10px 40px -16px rgba(0,0,0,.6)',
  rows: night.bubble,
  rowRule: 'rgba(255,255,255,.08)',
  /** The scrim over the scene while lanterns are lit: top to clear. */
  lanternScrim: ['rgba(16,17,34,0.72)', 'rgba(16,17,34,0.25)', 'rgba(16,17,34,0)'],
  /** The farm's card while friends sit by the fire. */
  glowCard: '#2b2e4a',
  /** The shared screen's paper. */
  paper: '#fdf8ef',
} as const;
