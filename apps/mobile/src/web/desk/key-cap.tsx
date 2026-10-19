import { View } from 'react-native';

import { useTheme } from '../../ui/theme/theme-provider';
import { Txt } from '../../ui/type/text';

/** A key as the desktop draws it in hints and the shortcuts list: `⌘K`, `⌥⌘L`, `↑`. */
export function KeyCap({ keys }: { readonly keys: string }) {
  const { palette } = useTheme();
  return (
    <View
      accessible={false}
      style={{
        minWidth: 22,
        height: 22,
        paddingHorizontal: 6,
        borderRadius: 6,
        backgroundColor: palette.card,
        borderWidth: 1,
        borderColor: palette.cardBorder,
        boxShadow: `0 1px 0 ${palette.hairline}`,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Txt variant="buttonSmall" style={{ fontSize: 12, lineHeight: 12 }}>
        {keys}
      </Txt>
    </View>
  );
}
