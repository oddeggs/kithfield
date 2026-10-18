import { useEffect } from 'react';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';

import { fadeTo, sheetTo } from '../motion/motion';
import { Press } from '../motion/press';
import { useReduceMotion } from '../motion/reduce-motion';
import { useTheme } from '../theme/theme-provider';

const W = 51;
const H = 31;
const KNOB = 27;
const INSET = 2;

/**
 * The toggle (`01 Foundations`): moss when on. The knob springs across (`motion.sheet`) while the
 * track fades; under Reduce Motion both fade.
 */
export function Toggle({
  value,
  onChange,
  label,
  disabled = false,
}: {
  readonly value: boolean;
  readonly onChange: (value: boolean) => void;
  /** What it turns on, for VoiceOver ("Lamp on"). */
  readonly label: string;
  readonly disabled?: boolean;
}) {
  const { palette } = useTheme();
  const reduce = useReduceMotion();
  const on = useSharedValue(value ? 1 : 0);
  const knob = useSharedValue(value ? 1 : 0);
  useEffect(() => {
    on.set(fadeTo(value ? 1 : 0));
    knob.set(reduce ? fadeTo(value ? 1 : 0) : sheetTo(value ? 1 : 0, false));
  }, [value, reduce, on, knob]);
  const { on: onColour, off: offColour, knob: knobColour } = palette.toggle;
  const track = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(on.get(), [0, 1], [offColour, onColour]),
  }));
  const thumb = useAnimatedStyle(() => ({
    transform: [{ translateX: knob.get() * (W - KNOB - INSET * 2) }],
  }));
  return (
    <Press
      onPress={() => onChange(!value)}
      haptic="select"
      darken={false}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled }}
      hitSlop={7}
      style={{ width: W, height: H }}
    >
      <Animated.View style={[{ width: W, height: H, borderRadius: H / 2 }, track]}>
        <Animated.View
          style={[
            {
              position: 'absolute',
              top: INSET,
              left: INSET,
              width: KNOB,
              height: KNOB,
              borderRadius: KNOB / 2,
              backgroundColor: knobColour,
              boxShadow: '0 2px 4px rgba(0,0,0,.2)',
            },
            thumb,
          ]}
        />
      </Animated.View>
    </Press>
  );
}
