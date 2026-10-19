import { View } from 'react-native';

import { useTheme } from '../../../ui/theme/theme-provider';
import { Header } from './layout';
import { ShopLoading } from './states';

/** A whole shop screen waiting for its first answer: the back button and one quiet line. */
export function ScreenLoading() {
  const { palette } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: palette.background, justifyContent: 'center' }}>
      <ShopLoading />
      <Header glass={false} />
    </View>
  );
}
