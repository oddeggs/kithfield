import { day, layout, night } from '@kithfield/theme';
import { getLocales } from 'expo-localization';
import { useMemo, type ReactNode } from 'react';
import { View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ArtIcon } from '../../ui/art/art-view';
import { Glass } from '../../ui/components/glass';
import { useLocale } from '../../ui/locale/locale-provider';
import { Press } from '../../ui/motion/press';
import { useTheme } from '../../ui/theme/theme-provider';
import { useAccessibilitySize } from '../../ui/type/accessibility-size';
import { Txt } from '../../ui/type/text';
import { withAlpha } from '../media/colour';
import { seasonNow } from './calendar';

/** The design draws these screens on a 393×852 phone whose safe area starts 59 points down. */
const DESIGN_TOP_INSET = 59;

/**
 * A distance from the top of the screen as the design gives it, moved with the phone's own safe
 * area, so the screens sit where the design puts them on that phone and stay clear elsewhere.
 */
export function useDesignTop(): (designTop: number) => number {
  const insets = useSafeAreaInsets();
  return (designTop) => designTop + insets.top - DESIGN_TOP_INSET;
}

/** The bottom buttons' distance from the bottom edge (`layout.buttonBottom` over the home bar). */
export function useBottom(): number {
  const insets = useSafeAreaInsets();
  return Math.max(insets.bottom, layout.buttonBottom);
}

/** Inks these screens use beyond the shared palette, by appearance. */
export function useInks() {
  const { appearance, palette } = useTheme();
  return useMemo(
    () =>
      appearance === 'night'
        ? {
            ...palette,
            list: night.moon2,
            moss: '#a9c48e',
            mossText: '#a9c48e',
            block: '#e09a7f',
            // The moss note under the code boxes.
            note: { bg: palette.chip.invitedBg, fg: '#a9c48e' },
            // A farmmate twin's warning card, on the night's plan tint.
            twin: { bg: palette.plan.bg, fg: palette.plan.detail },
            // The shape label on the critter stage.
            badge: { bg: palette.glassButton.fill, fg: palette.secondary },
          }
        : {
            ...palette,
            list: day.ink2,
            moss: day.moss,
            mossText: '#3f5a31',
            block: '#c96f4f',
            note: { bg: palette.chip.invitedBg, fg: '#3f4d33' },
            twin: { bg: '#F8E2C8', fg: day.ink2 },
            badge: { bg: withAlpha(palette.panel, 0.9), fg: palette.secondary },
          },
    [appearance, palette],
  );
}

/** The season and light the way-in scenes are drawn in. */
export function useSceneAttrs(): { season: string; night: boolean } {
  const { appearance } = useTheme();
  const region = getLocales()[0]?.regionCode ?? null;
  const season = useMemo(() => seasonNow(new Date(), region), [region]);
  return { season, night: appearance === 'night' };
}

/** The round back button: a soft ink tint, or glass over art. */
export function BackButton({
  onPress,
  overArt = false,
}: {
  readonly onPress: () => void;
  readonly overArt?: boolean;
}) {
  const { palette } = useTheme();
  const { t } = useLocale();
  const glyph = (
    <Txt
      variant="body"
      style={{ fontSize: 26, lineHeight: 26, marginTop: -3 }}
      importantForAccessibility="no"
    >
      ‹
    </Txt>
  );
  const shape = { width: 44, height: 44, borderRadius: 22 };
  return (
    <Press
      onPress={onPress}
      radius={22}
      accessibilityLabel={t('onboarding.back')}
      style={[shape, { alignItems: 'center', justifyContent: 'center' }]}
    >
      {overArt ? (
        <Glass
          radius={22}
          fill={palette.glassButton.fill}
          border={palette.glassButton.border}
          style={[shape, { position: 'absolute' }]}
        />
      ) : (
        <View style={[shape, { position: 'absolute', backgroundColor: palette.fillSoft }]} />
      )}
      {glyph}
    </Press>
  );
}

/**
 * The row at the top: back, a title or step dots in the middle, an action at the end. At the
 * accessibility sizes it takes its place at the head of the screen's column instead, and a title
 * in the middle wraps there rather than spilling over what's below.
 */
export function TopBar({
  onBack,
  center,
  trailing,
  overArt = false,
  designTop = 58,
  inset = 16,
}: {
  readonly onBack?: () => void;
  readonly center?: ReactNode;
  readonly trailing?: ReactNode;
  readonly overArt?: boolean;
  readonly designTop?: number;
  readonly inset?: number;
}) {
  const top = useDesignTop();
  const ax = useAccessibilitySize();
  const back = onBack ? (
    <BackButton onPress={onBack} overArt={overArt} />
  ) : (
    <View style={{ width: 44 }} />
  );
  const end = trailing ?? <View style={{ width: 44 }} />;
  if (ax) {
    return (
      <View
        style={{
          marginTop: top(designTop),
          marginHorizontal: inset,
          minHeight: 44,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          zIndex: 12,
        }}
      >
        {back}
        <View style={{ flex: 1, alignItems: 'center' }}>{center}</View>
        {end}
      </View>
    );
  }
  return (
    <View
      style={{
        position: 'absolute',
        top: top(designTop),
        left: inset,
        right: inset,
        minHeight: 44,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        zIndex: 12,
      }}
    >
      {back}
      <View style={{ position: 'absolute', left: 52, right: 52, alignItems: 'center' }}>
        {center}
      </View>
      {end}
    </View>
  );
}

/** A plain text action at the end of the top bar (Skip, Done). */
export function BarAction({
  label,
  onPress,
  tone = 'quiet',
  size = 15,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly tone?: 'quiet' | 'go';
  readonly size?: number;
}) {
  const inks = useInks();
  return (
    <Press onPress={onPress} darken={false} hitSlop={10} accessibilityLabel={label}>
      <Txt
        variant={size === 17 ? 'button' : 'buttonText'}
        color={tone === 'go' ? inks.mossText : inks.secondary}
        style={{ paddingHorizontal: tone === 'go' ? 0 : 6 }}
      >
        {label}
      </Txt>
    </Press>
  );
}

/** The step dots of the critter and farm screens: the current one long and inked. */
export function StepDots({ step, steps = 3 }: { readonly step: number; readonly steps?: number }) {
  const { palette } = useTheme();
  const { t } = useLocale();
  const off = withAlpha(palette.text, palette.appearance === 'night' ? 0.25 : 0.2);
  return (
    <View
      accessible
      accessibilityLabel={t('onboarding.step', { step, steps })}
      style={{ flexDirection: 'row', gap: 6 }}
    >
      {Array.from({ length: steps }, (_, i) => (
        <View
          key={i}
          style={{
            width: i + 1 === step ? 18 : 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: i + 1 === step ? palette.text : off,
          }}
        />
      ))}
    </View>
  );
}

/** The Gaegu line over a title ("one small thing"). */
export function Eyebrow({ children }: { readonly children: string }) {
  const inks = useInks();
  return (
    <Txt variant="handL" color={inks.moss} style={{ fontSize: 17, lineHeight: 18.7 }}>
      {children}
    </Txt>
  );
}

/** A screen title in the display face, at the design's size. */
export function Title({
  children,
  size = 30,
  line = 1.1,
  align,
}: {
  readonly children: string;
  readonly size?: number;
  readonly line?: number;
  readonly align?: 'center';
}) {
  return (
    <Txt
      variant="displayL"
      multiline
      accessibilityRole="header"
      {...(align ? { align } : {})}
      style={{ fontSize: size, lineHeight: Math.round(size * line * 100) / 100 }}
    >
      {children}
    </Txt>
  );
}

/** A paragraph under a title. */
export function Body({ children }: { readonly children: ReactNode }) {
  const { palette } = useTheme();
  return (
    <Txt variant="sheetBody" multiline color={palette.body}>
      {children}
    </Txt>
  );
}

/** One promise under an ask: a check for what happens, a no-sign for what never does. */
export function PromiseRow({
  text,
  never = false,
}: {
  readonly text: string;
  readonly never?: boolean;
}) {
  const inks = useInks();
  return (
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
      <ArtIcon
        name={never ? 'block' : 'check'}
        size={22}
        color={never ? inks.block : inks.moss}
        style={{ marginTop: 1 }}
      />
      <Txt variant="sheetBody" multiline color={inks.list} style={{ flex: 1, lineHeight: 21 }}>
        {text}
      </Txt>
    </View>
  );
}

/** The one plain line a failure shows (the sign-in errors). */
export function ErrorLine({ text }: { readonly text: string | null }) {
  const { palette } = useTheme();
  if (!text) return null;
  return (
    <Txt
      variant="caption"
      multiline
      align="center"
      color={palette.bubble.failedText}
      accessibilityLiveRegion="polite"
    >
      {text}
    </Txt>
  );
}

/** The buttons at the bottom of a screen. */
export function BottomBar({
  children,
  gap = 6,
  inset = layout.marginButton,
}: {
  readonly children: ReactNode;
  readonly gap?: number;
  readonly inset?: number;
}) {
  const bottom = useBottom();
  return (
    <View style={{ position: 'absolute', left: inset, right: inset, bottom, gap, zIndex: 20 }}>
      {children}
    </View>
  );
}

/**
 * A way-in screen at the accessibility text sizes, where the design's places no longer hold the
 * words: the top bar, then one column that scrolls (art, words, controls) with the buttons at its
 * end, kept clear of the keyboard.
 */
export function AxFlow({
  bar,
  children,
  footer,
  footerGap = 6,
  footerInset = layout.marginButton,
  overlay,
}: {
  readonly bar: ReactNode;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
  readonly footerGap?: number;
  readonly footerInset?: number;
  /** Sheets that sit over the screen rather than in its column. */
  readonly overlay?: ReactNode;
}) {
  const { palette } = useTheme();
  const bottom = useBottom();
  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      {bar}
      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        bottomOffset={16}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: 16, paddingBottom: bottom, gap: 20 }}
      >
        {children}
        {footer ? (
          <View style={{ paddingHorizontal: footerInset, gap: footerGap }}>{footer}</View>
        ) : null}
      </KeyboardAwareScrollView>
      {overlay}
    </View>
  );
}

/** The rose of the age check: on its paper by day, straight on the night sky after dark. */
export function roseAttrs(scene: { night: boolean }, stage: number) {
  return { name: 'rose', stage, ...(scene.night ? { color: 'none' } : {}) };
}
