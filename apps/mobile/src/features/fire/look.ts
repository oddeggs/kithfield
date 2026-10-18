import { fireRoom } from '@kithfield/theme';

/** The fire room's colours (`@kithfield/theme`'s `fireRoom`): the room is always night. */
export const fireLook = fireRoom;

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

/**
 * Vietnamese stacks its marks above the letters: a label set tight (line height near its size)
 * would clip them, so in Vietnamese no line is shorter than this many times its size.
 */
export const VI_LEADING = 1.4;

/** A size and line height for the reading language: tight in English, roomy in Vietnamese. */
export function lines(
  fontLocale: string,
  fontSize: number,
  lineHeight: number,
): { fontSize: number; lineHeight: number } {
  return {
    fontSize,
    lineHeight:
      fontLocale === 'vi' ? Math.max(lineHeight, Math.ceil(fontSize * VI_LEADING)) : lineHeight,
  };
}
