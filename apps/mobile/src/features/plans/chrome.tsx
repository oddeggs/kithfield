import { glass } from '@kithfield/theme';
import { router } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Glass } from '../../ui/components/glass';
import { useLocale } from '../../ui/locale/locale-provider';
import { Press } from '../../ui/motion/press';
import { useTheme } from '../../ui/theme/theme-provider';
import { Txt } from '../../ui/type/text';
import { ANDROID_BACK, AndroidBackArrow } from '../android/back-arrow';

const SIZE = 44;

/** The round glass back button the plan screens wear over their content (‹). */
export function GlassBack({
  fill,
  border,
  color,
}: {
  readonly fill?: string;
  readonly border?: string;
  readonly color?: string;
}) {
  const { palette, appearance } = useTheme();
  const { t } = useLocale();
  const day = appearance === 'day';
  return (
    <Press
      onPress={leave}
      haptic="select"
      radius={SIZE / 2}
      darken={false}
      accessibilityLabel={t('plans.plan.back')}
      testID="plans-back"
    >
      <Glass
        radius={SIZE / 2}
        fill={fill ?? (day ? glass.button.fill : palette.glassButton.fill)}
        border={border ?? (day ? glass.button.border : palette.glassButton.border)}
        style={{ width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' }}
      >
        {ANDROID_BACK ? (
          <AndroidBackArrow color={color ?? palette.text} />
        ) : (
          <Txt
            variant="body"
            color={color ?? palette.text}
            style={{ fontSize: 26, lineHeight: 30, marginTop: -3 }}
            importantForAccessibility="no"
          >
            ‹
          </Txt>
        )}
      </Glass>
    </Press>
  );
}

/** A plan screen's header: the back button and the screen's name, centred between. */
export function PlanHeader({ title, top }: { readonly title: string; readonly top: number }) {
  return (
    <View
      style={{
        position: 'absolute',
        top,
        left: 14,
        right: 14,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        zIndex: 6,
      }}
    >
      <GlassBack />
      <Txt
        variant="button"
        accessibilityRole="header"
        numberOfLines={1}
        align="center"
        style={{ flex: 1, marginHorizontal: 8 }}
      >
        {title}
      </Txt>
      <View style={{ width: SIZE }} />
    </View>
  );
}

/**
 * How far above the screen's bottom edge a pushed plan screen sets its bottom button: 34, as the
 * design puts it. The tab bar steps aside on a tab's pushed screens.
 */
export function useBottomButtonOffset(): number {
  return 34;
}

/** Back where the person came from, or to the seed bed when a link opened this screen first. */
export function leave(): void {
  if (router.canGoBack()) router.back();
  else router.replace('/seedbed');
}

/** The status bar's height on the phone the design is drawn for (iPhone 16). */
const DESIGN_TOP_INSET = 59;

/**
 * Places something the design sets `y` points from the top of the screen, below this phone's own
 * status bar: the same spot on the phone the design is drawn for, and clear of a taller one.
 */
export function useFromTop(): (y: number) => number {
  const { top } = useSafeAreaInsets();
  return (y) => top + (y - DESIGN_TOP_INSET);
}
