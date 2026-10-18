import { View } from 'react-native';

import { useTheme } from '../theme/theme-provider';
import type { ViewStyleProp } from '../style';

/**
 * New activity: a honey dot, never a number (`01 Foundations`, tab bar). Ringed in the colour of
 * what it sits on so it reads as separate from the icon under it.
 */
export function HoneyDot({
  ring,
  style,
}: {
  readonly ring?: string;
  readonly style?: ViewStyleProp;
}) {
  const { palette } = useTheme();
  return (
    <View
      pointerEvents="none"
      importantForAccessibility="no"
      style={[
        {
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: palette.honey,
          boxShadow: `0 0 0 2px ${ring ?? palette.dotRing}`,
        },
        style,
      ]}
    />
  );
}
