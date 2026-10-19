import { screens } from '@kithfield/theme';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ArtIcon } from '../art/art-view';
import { Press } from '../motion/press';
import { useTheme } from '../theme/theme-provider';
import { Txt } from '../type/text';
import { ANDROID_BACK, AndroidBackArrow } from '../../features/android/back-arrow';

export interface PaneAction {
  readonly icon: string;
  readonly label: string;
  readonly onPress: () => void;
}

const ICON = 20;
/** Icons sit close, as drawn; each still takes a 44-point touch. */
const ICON_BOX = 26;
const SLOP = (44 - ICON_BOX) / 2;

/** The height a pane's flat header takes from the pane's top, with the safe area it clears. */
export function usePaneHeaderHeight(): number {
  return useSafeAreaInsets().top + screens.paneHeader;
}

/**
 * A pane's flat header (`14 Platforms`): the title in the display face, a line beside it that
 * gives way first, and small icon actions at the trailing end, over a hairline. A pane with the
 * list behind it rather than beside it leads with a way back.
 */
export function PaneHeader({
  title,
  subtitle,
  onTitle,
  titleLabel,
  back,
  actions,
}: {
  readonly title: string;
  readonly subtitle: string;
  readonly onTitle?: () => void;
  readonly titleLabel?: string;
  readonly back?: { readonly label: string; readonly onPress: () => void } | null;
  readonly actions: readonly PaneAction[];
}) {
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();
  const words = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 }}>
      <Txt variant="displayS" numberOfLines={1} style={{ fontSize: 18, flexShrink: 0 }}>
        {title}
      </Txt>
      <Txt
        variant="caption"
        color={palette.secondary}
        numberOfLines={1}
        style={{ fontSize: 12.5, flexShrink: 1 }}
      >
        {subtitle}
      </Txt>
    </View>
  );
  return (
    <View
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        paddingTop: insets.top,
        backgroundColor: palette.background,
        borderBottomWidth: 1,
        borderBottomColor: palette.hairline,
      }}
    >
      <View
        style={{
          height: screens.paneHeader - 1,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingLeft: back ? 8 : 18,
          paddingRight: 18,
        }}
      >
        {back ? (
          <Press
            onPress={back.onPress}
            radius={22}
            accessibilityLabel={back.label}
            accessibilityRole="button"
            style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
          >
            {ANDROID_BACK ? (
              <AndroidBackArrow color={palette.text} />
            ) : (
              <Txt
                variant="body"
                style={{ fontSize: 26, marginTop: -3 }}
                importantForAccessibility="no"
              >
                ‹
              </Txt>
            )}
          </Press>
        ) : null}
        <View style={{ flex: 1, minWidth: 0 }}>
          {onTitle ? (
            <Press
              onPress={onTitle}
              darken={false}
              accessibilityRole="button"
              accessibilityLabel={titleLabel ?? `${title}, ${subtitle}`}
              style={{ alignSelf: 'flex-start', maxWidth: '100%' }}
            >
              {words}
            </Press>
          ) : (
            <View
              accessible
              accessibilityRole="header"
              accessibilityLabel={`${title}, ${subtitle}`}
            >
              {words}
            </View>
          )}
        </View>
        <View style={{ flexDirection: 'row' }}>
          {actions.map((a) => (
            <Press
              key={a.icon}
              onPress={a.onPress}
              radius={ICON_BOX / 2}
              hitSlop={SLOP}
              accessibilityLabel={a.label}
              accessibilityRole="button"
              style={{
                width: ICON_BOX,
                height: ICON_BOX,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ArtIcon name={a.icon} size={ICON} color={palette.secondary} />
            </Press>
          ))}
        </View>
      </View>
    </View>
  );
}
