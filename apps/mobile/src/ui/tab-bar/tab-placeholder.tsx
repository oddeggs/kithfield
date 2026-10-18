import { layout } from '@kithfield/theme';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLocale } from '../locale/locale-provider';
import { useTheme } from '../theme/theme-provider';
import { Txt } from '../type/text';

/**
 * A tab's first screen before its feature is built: the tab's name as a screen title on the
 * screen background. Each feature replaces its tab's `index` route with its own screen.
 */
export function TabPlaceholder({
  title,
}: {
  readonly title: 'shell.tab.farm' | 'shell.tab.chat' | 'shell.tab.seedBed' | 'shell.tab.you';
}) {
  const { palette } = useTheme();
  const { t } = useLocale();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: palette.background,
        paddingTop: insets.top + 12,
        paddingHorizontal: layout.marginTitle,
      }}
    >
      <Txt variant="displayL" accessibilityRole="header">
        {t(title)}
      </Txt>
    </View>
  );
}
