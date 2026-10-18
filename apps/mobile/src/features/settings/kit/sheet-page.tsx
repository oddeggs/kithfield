import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import { Button, type ButtonKind } from '../../../ui/components/button';
import { useTheme } from '../../../ui/theme/theme-provider';

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
  return (
    <View style={{ flex: 1, backgroundColor: palette.sheet }}>
      <ScrollView
        style={{ flex: 1 }}
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
