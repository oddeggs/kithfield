import { day, fireside, night } from '@kithfield/theme';

/*
 * The fire room's glass and text over the night scene, as `16 Fire Room and Calls` draws them.
 * The room is always night, whatever the phone's appearance. Colours the theme already names come
 * from it; the room's own translucent fills are the design's values.
 */
export const fireLook = {
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
  title: fireside.title,
  eyebrow: day.honey,
  /** The main button; and the quieter one beside it. */
  primary: day.honey,
  primaryInk: day.ink,
  secondary: 'rgba(255,255,255,.12)',
  /** Gesture tiles and the weak-connection note. */
  tile: 'rgba(255,255,255,.1)',
  note: 'rgba(255,255,255,.08)',
  /** "from you" over a gesture, and the critter's own glyphs. */
  glyph: '#ffd98a',
  /** The ring round the little critters in the panel. */
  ring: fireside.ring,
  /** Stopping a screen share. */
  stop: day.clay,
  /** The captions card. */
  card: 'rgba(24,26,48,.82)',
  /** A lantern frame's ring: honey when lit, dusk when the camera is off. */
  frameLit: '#c9973e',
  frameDark: '#6a6488',
} as const;

/** Sizes from the design, in points. */
export const fireSize = {
  sideInset: 16,
  headerTop: 58,
  button: 44,
  panelInset: 10,
  panelRadius: 44,
  bigButton: 54,
  smallButton: 46,
  chipHeight: 24,
  tile: 52,
  stackAvatar: 26,
  /** The scene sits this far up while the tall panel asks you something (lighting, joining). */
  askLift: 170,
} as const;
