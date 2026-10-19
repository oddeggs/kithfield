import { layout } from '@kithfield/theme';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLocale } from '../locale/locale-provider';
import { useTheme } from '../theme/theme-provider';
import { Txt } from '../type/text';
import { Button, type ButtonKind } from './button';

export interface ShellAction {
  label: string;
  onPress: () => void;
  icon?: string;
  kind?: ButtonKind;
}

/**
 * An empty list (`12 States`, the empty states): one illustration, one sentence on what will grow
 * here, one action. Only when the list is truly empty, never while it loads.
 */
export function EmptyState({
  art,
  title,
  body,
  action,
}: {
  readonly art: ReactNode;
  readonly title: string;
  readonly body: string;
  readonly action?: ShellAction;
}) {
  const { palette } = useTheme();
  return (
    <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 32 }}>
      <View style={{ alignItems: 'center' }} importantForAccessibility="no-hide-descendants">
        {art}
      </View>
      <View style={{ alignItems: 'center', gap: 10, marginTop: 20 }}>
        <Txt variant="displayM" multiline align="center" accessibilityRole="header">
          {title}
        </Txt>
        <Txt variant="sheetBody" multiline align="center" color={palette.body}>
          {body}
        </Txt>
        {action ? (
          <Button
            label={action.label}
            onPress={action.onPress}
            kind={action.kind ?? 'go'}
            {...(action.icon ? { icon: action.icon } : {})}
            style={{ marginTop: 8, alignSelf: 'stretch' }}
          />
        ) : null}
      </View>
    </View>
  );
}

/** Where the design sets an error's art from the top of the screen, under the status bar. */
const ART_BELOW_STATUS = 71;

/**
 * A full-screen error (`12 States`, the farm couldn't load), only when nothing is cached: the
 * art, a gentle title, what is still safe, a small support code, and the way on at the bottom.
 * A whole screen sets its art near the top as the design does (`place="top"`); an error inside a
 * screen that has its own header sits centred in the room left.
 */
export function ErrorState({
  art,
  title,
  body,
  code,
  action,
  secondary,
  place = 'centre',
}: {
  readonly art: ReactNode;
  readonly title: string;
  readonly body: string;
  /** A support code (`KF-503`), shown small. */
  readonly code?: string;
  readonly action: ShellAction;
  readonly secondary?: ShellAction;
  readonly place?: 'top' | 'centre';
}) {
  const { palette } = useTheme();
  const { t } = useLocale();
  const insets = useSafeAreaInsets();
  const top = place === 'top';
  return (
    <View style={{ flex: 1, paddingTop: insets.top + (top ? ART_BELOW_STATUS : 0) }}>
      <View style={{ flex: 1, justifyContent: top ? 'flex-start' : 'center' }}>
        <View style={{ alignItems: 'center' }} importantForAccessibility="no-hide-descendants">
          {art}
        </View>
        <View style={{ alignItems: 'center', gap: 10, marginTop: 20, paddingHorizontal: 32 }}>
          <Txt variant="errorTitle" multiline align="center" accessibilityRole="header">
            {title}
          </Txt>
          <Txt variant="sheetBody" multiline align="center" color={palette.body}>
            {body}
          </Txt>
          {code ? (
            <Txt variant="code" mono color={palette.placeholder} style={{ marginTop: 4 }}>
              {t('shell.error.code', { code })}
            </Txt>
          ) : null}
        </View>
      </View>
      <View
        style={{
          paddingHorizontal: layout.marginButton,
          paddingBottom: Math.max(insets.bottom, layout.buttonBottom),
          gap: 6,
        }}
      >
        <Button
          label={action.label}
          onPress={action.onPress}
          kind={action.kind ?? 'primary'}
          {...(action.icon ? { icon: action.icon } : {})}
        />
        {secondary ? (
          <Button label={secondary.label} onPress={secondary.onPress} kind="text" />
        ) : null}
      </View>
    </View>
  );
}
