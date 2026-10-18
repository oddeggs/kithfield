import { useWindowDimensions } from 'react-native';

/**
 * The text scale where the accessibility sizes (AX1 to AX5) begin. There layouts change rather
 * than shrink (`12 States`, largest Dynamic Type): tab labels hide, bubbles go full width and side
 * by side controls stack.
 */
export const AX_FONT_SCALE = 1.6;

/** Whether the reader has chosen one of the accessibility text sizes. */
export function useAccessibilitySize(): boolean {
  return useWindowDimensions().fontScale >= AX_FONT_SCALE;
}
