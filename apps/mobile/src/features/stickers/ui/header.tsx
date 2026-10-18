import { router } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLocale } from '../../../ui/locale/locale-provider';
import { Press } from '../../../ui/motion/press';
import { useTheme } from '../../../ui/theme/theme-provider';
import { Txt } from '../../../ui/type/text';

/** Leaves a sticker screen: back to where it came from, or home when opened from a link. */
export function leave(): void {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/**
 * The top of a sticker screen: the round back button, and the title centred over the screen.
 * `glass` is the frosted button over art; otherwise a soft ink circle on paper.
 */
export function ScreenHeader({
  title,
  glass = true,
  onBack = leave,
}: {
  readonly title?: string;
  readonly glass?: boolean;
  readonly onBack?: () => void;
}) {
  const { t } = useLocale();
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        position: 'absolute',
        top: insets.top - 1,
        left: 20,
        right: 20,
        height: 44,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        zIndex: 10,
      }}
    >
      <Press
        onPress={onBack}
        radius={22}
        accessibilityLabel={t('stickers.back')}
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          alignItems: 'center',
          justifyContent: 'center',
          ...(glass
            ? {
                backgroundColor: palette.glassButton.fill,
                borderWidth: 1,
                borderColor: palette.glassButton.border,
              }
            : { backgroundColor: palette.fillSoft }),
        }}
      >
        <Txt variant="chevron" style={{ fontSize: 26, lineHeight: 26, marginTop: -3 }}>
          ‹
        </Txt>
      </Press>
      {title ? (
        <Txt
          variant="button"
          accessibilityRole="header"
          numberOfLines={1}
          style={{ flexShrink: 1 }}
        >
          {title}
        </Txt>
      ) : null}
      <View style={{ width: 44 }} />
    </View>
  );
}
