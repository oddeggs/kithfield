import { BlurView } from 'expo-blur';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { useTheme } from '../theme/theme-provider';
import type { ViewStyleProp } from '../style';

/**
 * Glass chrome over art (`01 Foundations`: the tab bar and round buttons over the farm): a system
 * blur under the design's translucent fill, a hairline border and, outside the clip, a shadow.
 */
export function Glass({
  radius,
  fill,
  border,
  shadow,
  style,
  children,
}: {
  readonly radius: number;
  readonly fill: string;
  readonly border: string;
  readonly shadow?: string;
  readonly style?: ViewStyleProp;
  readonly children?: ReactNode;
}) {
  const { palette } = useTheme();
  return (
    <View style={[{ borderRadius: radius }, shadow ? { boxShadow: shadow } : null, style]}>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          borderRadius: radius,
          overflow: 'hidden',
        }}
      >
        <BlurView
          intensity={40}
          tint={palette.tabBar.blurTint}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: fill,
            borderRadius: radius,
            borderWidth: 1,
            borderColor: border,
          }}
        />
      </View>
      {children}
    </View>
  );
}
