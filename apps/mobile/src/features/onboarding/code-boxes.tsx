import { fontFor, motion } from '@kithfield/theme';
import { forwardRef, useEffect, useImperativeHandle, useRef, type ComponentRef } from 'react';
import { TextInput, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { useLocale } from '../../ui/locale/locale-provider';
import { Press } from '../../ui/motion/press';
import { useReduceMotion } from '../../ui/motion/reduce-motion';
import { useTheme } from '../../ui/theme/theme-provider';
import { AX_FONT_SCALE } from '../../ui/type/accessibility-size';
import { componentType } from '../../ui/type/styles';
import { Txt } from '../../ui/type/text';
import { useInks } from './kit';

export const CODE_LENGTH = 6;

/** Only the digits, at most six: what someone typed or Mail filled in. */
export const codeDigits = (text: string) => text.replace(/\D/g, '').slice(0, CODE_LENGTH);

export interface CodeBoxesHandle {
  /** A wrong code: the boxes shake once (3 points, two cycles) and empty. */
  shake(): void;
}

/**
 * Six boxes over one hidden field, so the system fills the code from Mail (`oneTimeCode`) and the
 * number pad types straight in. The box being typed shows a moss border and a caret.
 */
export const CodeBoxes = forwardRef<
  CodeBoxesHandle,
  {
    readonly value: string;
    readonly onChange: (code: string) => void;
    readonly label: string;
  }
>(function CodeBoxes({ value, onChange, label }, ref) {
  const { palette } = useTheme();
  const inks = useInks();
  const { fontLocale, t } = useLocale();
  const reduce = useReduceMotion();
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const x = useSharedValue(0);

  useImperativeHandle(ref, () => ({
    shake() {
      onChange('');
      if (reduce) return;
      // Each sway is one held drawing on twos (`motion.twos`), there and back twice.
      const step = { duration: motion.twos.frameMs / 2, easing: Easing.inOut(Easing.sin) };
      x.set(
        withSequence(
          withTiming(-3, step),
          withRepeat(withTiming(3, { ...step, duration: motion.twos.frameMs }), 3, true),
          withTiming(0, step),
        ),
      );
    },
  }));

  useEffect(() => {
    const timer = setTimeout(() => input.current?.focus(), 350);
    return () => clearTimeout(timer);
  }, []);

  const moved = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));
  const digitFont = fontFor({ ...componentType.fieldValue, size: 28, lineHeight: 28 }, fontLocale);
  const active = Math.min(value.length, CODE_LENGTH - 1);

  return (
    <Press
      onPress={() => input.current?.focus()}
      darken={false}
      accessibilityLabel={label}
      // One element for VoiceOver: how much of the code is in.
      accessibilityValue={{ text: t('onboarding.code.typed', { count: value.length }) }}
    >
      <Animated.View
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        style={[{ flexDirection: 'row', gap: 8 }, moved]}
      >
        {Array.from({ length: CODE_LENGTH }, (_, i) => {
          const focused = i === active && value.length < CODE_LENGTH;
          return (
            <View
              key={i}
              style={{
                flex: 1,
                minHeight: 60,
                borderRadius: 14,
                backgroundColor: palette.card,
                borderWidth: focused ? 2 : 1,
                borderColor: focused ? inks.moss : palette.chip.border,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {value[i] ? (
                // A digit sits in its box: it grows with the text up to where the accessibility sizes begin.
                <Txt
                  variant="fieldValue"
                  maxFontSizeMultiplier={AX_FONT_SCALE}
                  style={[digitFont, { color: palette.text }]}
                >
                  {value[i]}
                </Txt>
              ) : focused ? (
                <View
                  style={{ width: 2, height: 28, borderRadius: 1, backgroundColor: inks.moss }}
                />
              ) : null}
            </View>
          );
        })}
      </Animated.View>
      <TextInput
        ref={input}
        value={value}
        onChangeText={(text) => onChange(codeDigits(text))}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={CODE_LENGTH}
        caretHidden
        accessibilityElementsHidden
        importantForAccessibility="no"
        style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }}
      />
    </Press>
  );
});
