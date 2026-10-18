import type { ReactNode } from 'react';
import { ScrollView, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, type ButtonKind } from '../../../ui/components/button';
import { useTheme } from '../../../ui/theme/theme-provider';

/** The room iOS leaves above a full-height sheet, under the status bar. */
const SHEET_GAP = 10;

/**
 * A sheet route (`app/(modal)/…`): the shell presents it as the native sheet, which rises with the
 * system spring and follows the finger. Its content sits 18 points in with 12-point gaps, and its
 * buttons 34 above the bottom edge.
 */
export function SheetPage({
  children,
  footer,
}: {
  readonly children: ReactNode;
  readonly footer?: ReactNode;
}) {
  const { palette } = useTheme();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  return (
    // A sheet as tall as what it holds, up to the screen below the status bar: past that its
    // content scrolls and the buttons stay in view.
    <View style={{ backgroundColor: palette.sheet, maxHeight: height - insets.top - SHEET_GAP }}>
      {/* Keeps the scroll view off the native sheet's first-view path, where the sheet would
          stretch it to its own frame and draw the content below the buttons. */}
      <View collapsable={false} />
      <ScrollView
        style={{ flexGrow: 0, flexShrink: 1 }}
        contentContainerStyle={{ paddingTop: 26, paddingHorizontal: 18, gap: 12 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
      {footer ? (
        <View style={{ paddingHorizontal: 18, paddingTop: 12, paddingBottom: 34, gap: 6 }}>
          {footer}
        </View>
      ) : null}
    </View>
  );
}

/** The sheet's way on, and its way back: a 56-point button over a text button. */
export function SheetButtons({
  primary,
  primaryKind = 'primary',
  onPrimary,
  secondary,
  onSecondary,
  busy = false,
}: {
  readonly primary: string;
  readonly primaryKind?: ButtonKind;
  readonly onPrimary: () => void;
  readonly secondary?: string;
  readonly onSecondary?: () => void;
  readonly busy?: boolean;
}) {
  return (
    <>
      <Button label={primary} kind={primaryKind} onPress={onPrimary} disabled={busy} />
      {secondary && onSecondary ? (
        <Button label={secondary} kind="text" onPress={onSecondary} />
      ) : null}
    </>
  );
}
