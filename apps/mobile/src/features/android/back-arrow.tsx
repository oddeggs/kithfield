import { Platform, Text } from 'react-native';

/** Android draws its own back arrow on every stack screen; iOS keeps the design's ‹. */
export const ANDROID_BACK = Platform.OS === 'android';

/**
 * Android's back arrow (`14 Platforms`, the top app bar): Roboto's ← at 24 points, in place of
 * the ‹ the iOS screens draw. It sits in the same round button; only the glyph changes.
 */
export function AndroidBackArrow({
  color,
  size = 24,
}: {
  readonly color: string;
  readonly size?: number;
}) {
  return (
    <Text
      allowFontScaling={false}
      importantForAccessibility="no"
      style={{
        color,
        fontSize: size,
        lineHeight: Math.round(size * 1.15),
        includeFontPadding: false,
        textAlignVertical: 'center',
      }}
    >
      ←
    </Text>
  );
}
