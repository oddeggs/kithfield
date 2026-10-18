import type { ViewProps } from 'react-native';

/**
 * A view's `style` prop. Expo's web typings widen React Native's `ViewStyle` (fixed and sticky
 * positions) past what a native `View` takes, so components type their style props with this.
 */
export type ViewStyleProp = ViewProps['style'];
