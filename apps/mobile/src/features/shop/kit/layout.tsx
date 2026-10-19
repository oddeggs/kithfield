import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ArtIcon } from '../../../ui/art/art-view';
import { useLocale } from '../../../ui/locale/locale-provider';
import { Press } from '../../../ui/motion/press';
import type { ViewStyleProp } from '../../../ui/style';
import { useTheme } from '../../../ui/theme/theme-provider';
import { useInks } from './inks';
import { SText } from './text';
import { ANDROID_BACK, AndroidBackArrow } from '../../android/back-arrow';

/** The design's status bar is 54 tall and content starts at 59 on an iPhone 16. */
const DESIGN_SAFE_TOP = 59;

/** A y position from `09 Shop and Plus`, moved to this phone's safe area. */
export function useDesignTop(): (y: number) => number {
  const insets = useSafeAreaInsets();
  return (y) => insets.top + y - DESIGN_SAFE_TOP;
}

/** The round 44-point button: glass over art, ink-tinted on paper. */
export function RoundButton({
  onPress,
  label,
  icon,
  glass = true,
}: {
  readonly onPress: () => void;
  readonly label: string;
  /** An icon from the design's set; the back chevron when absent. */
  readonly icon?: string;
  readonly glass?: boolean;
}) {
  const inks = useInks();
  const { palette } = useTheme();
  return (
    <Press
      onPress={onPress}
      radius={22}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: glass ? inks.glass : palette.fillSoft,
      }}
    >
      {icon ? (
        <ArtIcon name={icon} size={22} color={palette.text} />
      ) : ANDROID_BACK ? (
        <AndroidBackArrow color={palette.text} />
      ) : (
        <SText s={24} style={{ marginTop: -3 }}>
          ‹
        </SText>
      )}
    </Press>
  );
}

/** Back to wherever the shop was opened from, or out of the shop from its first screen. */
export function goBack(): void {
  if (router.canGoBack()) router.back();
}

/**
 * The header row 58 points down: back on the left, an optional centred title, and an optional
 * control on the right. Over art the buttons are glass; on paper they are ink-tinted.
 */
export function Header({
  title,
  right,
  glass = true,
  onBack,
}: {
  readonly title?: string;
  readonly right?: ReactNode;
  readonly glass?: boolean;
  readonly onBack?: () => void;
}) {
  const top = useDesignTop();
  const { t } = useLocale();
  return (
    <View
      style={{
        position: 'absolute',
        top: top(58),
        left: 16,
        right: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        zIndex: 12,
      }}
    >
      <RoundButton onPress={onBack ?? goBack} label={t('shop.back')} glass={glass} />
      <View style={{ flex: 1, alignItems: 'center', paddingHorizontal: 8 }} pointerEvents="none">
        {title ? (
          <SText s={17} lh={1.2} w={600} numberOfLines={1} accessibilityRole="header">
            {title}
          </SText>
        ) : null}
      </View>
      {right ?? <View style={{ width: 44 }} />}
    </View>
  );
}

/** The sheet's grabber: 36 × 5, as drawn (the sheet itself doesn't drag). */
export function Grabber() {
  const { palette } = useTheme();
  return (
    <View
      style={{
        width: 36,
        height: 5,
        borderRadius: 3,
        backgroundColor: palette.grabber,
        alignSelf: 'center',
      }}
    />
  );
}

/**
 * A screen with art across the top and the sheet over it from `sheetTop` (the design's y on an
 * iPhone 16): the art fills `artHeight`, the sheet scrolls its content with the design's 10/20
 * padding and `gap`, and `footer` is pinned at the sheet's bottom.
 */
export function HeroSheet({
  art,
  artHeight,
  sheetTop,
  header,
  gap = 12,
  children,
  footer,
  scroll = true,
}: {
  readonly art: ReactNode;
  readonly artHeight: number;
  readonly sheetTop: number;
  readonly header?: ReactNode;
  readonly gap?: number;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
  /** Off for a sheet whose content always fits. */
  readonly scroll?: boolean;
}) {
  const { palette } = useTheme();
  const inks = useInks();
  const insets = useSafeAreaInsets();
  const top = useDesignTop();
  const content = (
    <View style={{ paddingTop: 10, paddingHorizontal: 20, gap }}>
      <Grabber />
      {children}
    </View>
  );
  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: top(artHeight) }}>
        {art}
      </View>
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: top(sheetTop),
          bottom: 0,
          backgroundColor: palette.sheet,
          borderTopLeftRadius: 30,
          borderTopRightRadius: 30,
          boxShadow: inks.sheetShadow,
          overflow: 'hidden',
        }}
      >
        {scroll ? (
          <ScrollView
            contentContainerStyle={{ paddingBottom: footer ? 16 : insets.bottom + 24 }}
            showsVerticalScrollIndicator={false}
          >
            {content}
          </ScrollView>
        ) : (
          <View style={{ flex: 1 }}>{content}</View>
        )}
        {footer ? (
          <View style={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 12, gap: 10 }}>
            {footer}
          </View>
        ) : null}
      </View>
      {header}
    </View>
  );
}

/**
 * A pushed screen on paper: the header, then content scrolling from `top` (the design's y) with
 * 16-point margins, and `footer` pinned above the home indicator.
 */
export function PaperPage({
  header,
  top = 112,
  gap = 12,
  inset = 20,
  children,
  footer,
  style,
}: {
  readonly header?: ReactNode;
  readonly top?: number;
  readonly gap?: number;
  readonly inset?: number;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
  readonly style?: ViewStyleProp;
}) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const at = useDesignTop();
  return (
    <View style={[{ flex: 1, backgroundColor: palette.background }, style]}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: at(top),
          paddingHorizontal: inset,
          paddingBottom: footer ? 16 : insets.bottom + 24,
          gap,
        }}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
      {footer ? (
        <View style={{ paddingHorizontal: 24, paddingBottom: insets.bottom + 12, gap: 10 }}>
          {footer}
        </View>
      ) : null}
      {header}
    </View>
  );
}
