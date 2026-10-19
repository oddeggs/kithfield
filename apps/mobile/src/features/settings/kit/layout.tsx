import { layout } from '@kithfield/theme';
import { router } from 'expo-router';
import { Children, isValidElement, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ArtIcon } from '../../../ui/art/art-view';
import { Press } from '../../../ui/motion/press';
import { useLocale } from '../../../ui/locale/locale-provider';
import { useTheme } from '../../../ui/theme/theme-provider';
import type { ViewStyleProp } from '../../../ui/style';
import { useKitColors } from './colors';
import { KText } from './text';
import { ANDROID_BACK, AndroidBackArrow } from '../../android/back-arrow';

/** The design's status bar is 54 tall and its content starts at 59 on an iPhone 16. */
const DESIGN_SAFE_TOP = 59;

/** A y position from `11 Settings and Safety`, moved to this phone's safe area. */
export function useDesignTop(): (y: number) => number {
  const insets = useSafeAreaInsets();
  return (y) => insets.top + y - DESIGN_SAFE_TOP;
}

/** The round 44-point back button: ink-tinted, or glass over art. */
export function BackButton({
  glass = false,
  onPress,
  label,
}: {
  readonly glass?: boolean;
  readonly onPress?: () => void;
  readonly label?: string;
}) {
  const { palette } = useTheme();
  const kit = useKitColors();
  const { t } = useLocale();
  return (
    <Press
      onPress={onPress ?? (() => router.back())}
      radius={22}
      accessibilityRole="button"
      accessibilityLabel={label ?? t('settings.back')}
      style={[
        { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
        glass
          ? { backgroundColor: kit.glass.fill, borderWidth: 1, borderColor: kit.glass.border }
          : { backgroundColor: palette.fillSoft },
      ]}
    >
      {ANDROID_BACK ? (
        <AndroidBackArrow color={palette.text} />
      ) : (
        <KText
          kind="chevron"
          style={{ fontSize: glass ? 26 : 24, lineHeight: 26, marginTop: -3, fontWeight: '400' }}
        >
          ‹
        </KText>
      )}
    </Press>
  );
}

/** A round 44-point button with an icon, as the header's right-hand control. */
export function IconCircle({
  icon,
  label,
  onPress,
  glass = false,
}: {
  readonly icon: string;
  readonly label: string;
  readonly onPress: () => void;
  readonly glass?: boolean;
}) {
  const { palette } = useTheme();
  const kit = useKitColors();
  return (
    <Press
      onPress={onPress}
      radius={22}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[
        { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
        glass
          ? { backgroundColor: kit.glass.fill, borderWidth: 1, borderColor: kit.glass.border }
          : { backgroundColor: palette.fillSoft },
      ]}
    >
      <ArtIcon name={icon} size={20} color={palette.text} />
    </Press>
  );
}

/** The pushed screens' header: back, a centred title (and a line under it), a right control. */
export function NavBar({
  title,
  subtitle,
  right,
  onBack,
}: {
  readonly title: string;
  readonly subtitle?: string;
  readonly right?: ReactNode;
  readonly onBack?: () => void;
}) {
  const top = useDesignTop();
  const { palette } = useTheme();
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
      <BackButton {...(onBack ? { onPress: onBack } : {})} />
      <View style={{ flex: 1, alignItems: 'center', paddingHorizontal: 8 }}>
        <KText kind="navTitle" align="center" accessibilityRole="header" numberOfLines={1}>
          {title}
        </KText>
        {subtitle ? (
          <KText
            kind="navSub"
            align="center"
            color={palette.body}
            numberOfLines={1}
            style={{ marginTop: 2 }}
          >
            {subtitle}
          </KText>
        ) : null}
      </View>
      {right ?? <View style={{ width: 44 }} />}
    </View>
  );
}

/**
 * A pushed screen: the screen background, the header, and its content scrolling from `top` with
 * the design's 16-point margins and 10-point gaps, clearing the home indicator at the bottom.
 */
export function Page({
  header,
  top = 112,
  gap = 10,
  inset = 16,
  children,
  footer,
}: {
  readonly header?: ReactNode;
  readonly top?: number;
  readonly gap?: number;
  readonly inset?: number;
  readonly children: ReactNode;
  /** Pinned under the scrolling content (bottom buttons). */
  readonly footer?: ReactNode;
}) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const at = useDesignTop();
  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
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
      {footer}
      {header}
    </View>
  );
}

/** A section label over a group. */
export function Label({
  text,
  settings = false,
}: {
  readonly text: string;
  readonly settings?: boolean;
}) {
  const kit = useKitColors();
  return (
    <KText
      kind={settings ? 'settingsLabel' : 'label'}
      color={settings ? kit.settingsLabel : kit.label}
      accessibilityRole="header"
      style={{ paddingHorizontal: settings ? 14 : 4 }}
    >
      {text}
    </KText>
  );
}

/** A quiet line under a group. */
export function Note({ text, style }: { readonly text: string; readonly style?: ViewStyleProp }) {
  const { palette } = useTheme();
  return (
    <View style={[{ paddingHorizontal: 4 }, style]}>
      <KText kind="note" multiline color={palette.secondary}>
        {text}
      </KText>
    </View>
  );
}

/** Rows on one card, hairlines between them (radius 22, 2 × 14 padding). */
export function Group({
  children,
  settings = false,
  style,
}: {
  readonly children: ReactNode;
  /** Settings' variant: radius 20, a hairline border, rows padded inside. */
  readonly settings?: boolean;
  readonly style?: ViewStyleProp;
}) {
  const { palette } = useTheme();
  const rows = Children.toArray(children).filter(isValidElement);
  return (
    <View
      style={[
        {
          borderRadius: settings ? 20 : 22,
          backgroundColor: palette.card,
          overflow: 'hidden',
        },
        settings
          ? { borderWidth: 1, borderColor: palette.hairline }
          : { paddingVertical: 2, paddingHorizontal: 14 },
        style,
      ]}
    >
      {rows.map((row, i) => (
        <View
          key={row.key ?? i}
          style={
            i === 0
              ? null
              : settings
                ? { borderTopWidth: 1, borderTopColor: palette.hairline }
                : { borderTopWidth: 1, borderTopColor: palette.hairline }
          }
        >
          {row}
        </View>
      ))}
    </View>
  );
}

export interface RowProps {
  readonly title: string;
  readonly subtitle?: string | null;
  /** A value before the chevron ("Always", "Spring"). */
  readonly value?: string;
  /** An icon on a soft 40-point tile. */
  readonly icon?: string;
  /** Anything before the title (a critter). */
  readonly lead?: ReactNode;
  /** Something after the title (a badge). */
  readonly badge?: ReactNode;
  /** A control at the end: a toggle, a radio, a button. */
  readonly trailing?: ReactNode;
  readonly danger?: boolean;
  /** The devices and About lists' row: a 38-point tile and a 13-point subtitle. */
  readonly small?: boolean;
  /** A radio choice: the row stays tappable and shows its ring. */
  readonly selected?: boolean;
  /** Shows the chevron; on by default when the row is tappable and has no control. */
  readonly chevron?: boolean;
  readonly onPress?: () => void;
  readonly accessibilityLabel?: string;
}

/** The design's row: tile, title and subtitle, then a value and chevron or a control. */
export function Row({
  title,
  subtitle,
  value,
  icon,
  lead,
  badge,
  trailing,
  danger = false,
  small = false,
  selected,
  chevron,
  onPress,
  accessibilityLabel,
}: RowProps) {
  const { palette } = useTheme();
  const kit = useKitColors();
  const radio = selected !== undefined;
  const showChevron = chevron ?? (onPress !== undefined && trailing === undefined && !radio);
  const body = (
    <>
      {icon ? (
        <View
          style={{
            width: small ? 38 : 40,
            height: small ? 38 : 40,
            borderRadius: small ? 11 : 12,
            backgroundColor: palette.fillSoft,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ArtIcon name={icon} size={small ? 22 : 23.2} color={palette.text} />
        </View>
      ) : null}
      {lead}
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
          <KText kind="rowTitle" multiline color={danger ? kit.danger : palette.text}>
            {title}
          </KText>
          {badge}
        </View>
        {subtitle ? (
          <KText
            kind={small ? 'settingSub' : 'rowSub'}
            multiline
            color={palette.secondary}
            style={{ marginTop: 2 }}
          >
            {subtitle}
          </KText>
        ) : null}
      </View>
      {value !== undefined || showChevron ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
          {value !== undefined ? (
            <KText kind="value" color={kit.value} numberOfLines={1} style={{ flexShrink: 1 }}>
              {value}
            </KText>
          ) : null}
          {showChevron ? (
            <KText kind="chevron" color={kit.chevron} importantForAccessibility="no">
              ›
            </KText>
          ) : null}
        </View>
      ) : null}
      {trailing}
      {radio ? <Radio on={selected} /> : null}
    </>
  );
  const style = {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: small ? 10 : 9,
    // The design's rows are 44 tall inside their padding.
    minHeight: layout.minHitTarget + (small ? 20 : 18),
  } as const;
  const label =
    accessibilityLabel ??
    [title, subtitle, value].filter((s): s is string => typeof s === 'string').join(', ');
  if (!onPress || trailing) {
    return (
      <View accessible={!trailing} accessibilityLabel={label} style={style}>
        {body}
      </View>
    );
  }
  return (
    <Press
      onPress={onPress}
      darken={false}
      accessibilityRole={radio ? 'radio' : 'button'}
      {...(radio ? { accessibilityState: { selected } } : {})}
      accessibilityLabel={label}
      style={style}
    >
      {body}
    </Press>
  );
}

/** A choice among several: an empty ring, or moss with a white centre. */
export function Radio({ on }: { readonly on: boolean }) {
  const kit = useKitColors();
  return (
    <View
      style={{
        width: 22,
        height: 22,
        borderRadius: 11,
        borderWidth: on ? 7 : 1.5,
        borderColor: on ? kit.radioOn : kit.radioOff,
      }}
    />
  );
}

/** A small rounded badge after a name ("keeper", "this phone"). */
export function Badge({
  text,
  tone,
}: {
  readonly text: string;
  readonly tone: 'keeper' | 'helper';
}) {
  const kit = useKitColors();
  const c = tone === 'keeper' ? kit.keeperBadge : kit.helperBadge;
  return (
    <View
      style={{
        marginLeft: 6,
        paddingHorizontal: 6,
        paddingVertical: 3,
        borderRadius: 6,
        backgroundColor: c.bg,
      }}
    >
      <KText kind="badge" color={c.fg}>
        {text}
      </KText>
    </View>
  );
}

export type PillKind = 'soft' | 'ink' | 'danger' | 'go' | 'honey';

/** The design's pill buttons inside cards (46 tall) and at the bottom of sheets (56). */
export function Pill({
  label,
  onPress,
  kind = 'soft',
  height = 46,
  icon,
  disabled = false,
  style,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly kind?: PillKind;
  readonly height?: number;
  readonly icon?: string;
  readonly disabled?: boolean;
  readonly style?: ViewStyleProp;
}) {
  const { palette } = useTheme();
  const colours =
    kind === 'ink'
      ? palette.primary
      : kind === 'danger'
        ? palette.destructive
        : kind === 'go'
          ? palette.go
          : kind === 'honey'
            ? palette.light
            : { bg: palette.fillSecondary, fg: palette.text };
  return (
    <Press
      onPress={onPress}
      disabled={disabled}
      radius={height / 2}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[
        {
          minHeight: height,
          borderRadius: height / 2,
          backgroundColor: colours.bg,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          paddingHorizontal: 18,
          opacity: disabled ? 0.45 : 1,
        },
        style,
      ]}
    >
      {icon ? <ArtIcon name={icon} size={18} color={colours.fg} /> : null}
      <KText
        kind="pill"
        color={colours.fg}
        numberOfLines={1}
        style={height > 50 ? { fontSize: 16.5, lineHeight: 20 } : null}
      >
        {label}
      </KText>
    </Press>
  );
}
