import { fontFor, radii } from '@kithfield/theme';
import { TextInput, View, type TextInputProps } from 'react-native';

import { useLocale } from '../locale/locale-provider';
import { useTheme } from '../theme/theme-provider';
import { componentType } from '../type/styles';
import { useAccessibilitySize } from '../type/accessibility-size';
import { Txt } from '../type/text';

export interface TextFieldProps extends Omit<
  TextInputProps,
  'style' | 'placeholderTextColor' | 'multiline'
> {
  /** A labelled row: the label on the left, the value on the right in the display face. */
  readonly label?: string;
  readonly multiline?: boolean;
}

/**
 * Fields (`01 Foundations`): a labelled row 54 tall whose value is set in Young Serif (Lora in
 * Vietnamese), or a plain field 46 tall for a few words.
 */
export function TextField({ label, multiline = false, ...input }: TextFieldProps) {
  const { palette } = useTheme();
  const { fontLocale } = useLocale();
  const labelled = label !== undefined;
  // At accessibility sizes a labelled row stacks: the label above, the value below it.
  const stacked = useAccessibilitySize();
  const font = fontFor(labelled ? componentType.fieldValue : componentType.fieldText, fontLocale, {
    multiline,
  });
  return (
    <View
      style={{
        minHeight: labelled ? 54 : 46,
        borderRadius: radii.field,
        backgroundColor: palette.card,
        borderWidth: 1,
        borderColor: palette.cardBorder,
        flexDirection: stacked ? 'column' : 'row',
        alignItems: stacked ? 'stretch' : multiline ? 'flex-start' : 'center',
        justifyContent: 'space-between',
        gap: 10,
        paddingHorizontal: 16,
        paddingVertical: multiline || stacked ? 12 : 0,
      }}
    >
      {labelled ? (
        <Txt variant="fieldLabel" color={palette.body} importantForAccessibility="no">
          {label}
        </Txt>
      ) : null}
      <TextInput
        {...input}
        {...(labelled ? { accessibilityLabel: label } : {})}
        multiline={multiline}
        placeholderTextColor={palette.placeholder}
        selectionColor={palette.go.bg}
        style={[
          font,
          // A single-line input centres its own line; a fixed line height would push it down.
          multiline ? null : { lineHeight: undefined },
          {
            color: palette.text,
            flex: 1,
            minHeight: 44,
            textAlign: labelled && !stacked ? 'right' : 'left',
            paddingVertical: 0,
          },
        ]}
      />
    </View>
  );
}
