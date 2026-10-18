import { radii } from '@kithfield/theme';
import { useEffect, useRef, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { haptics } from '../motion/haptics';
import { fadeTo, sheetTo } from '../motion/motion';
import { Press } from '../motion/press';
import { useReduceMotion } from '../motion/reduce-motion';
import { useTheme } from '../theme/theme-provider';
import { Txt } from '../type/text';

export interface Segment<T extends string> {
  value: T;
  label: string;
}

const PAD = 3;

/**
 * The segmented control (`01 Foundations`): a 12-radius track with a raised card that springs to
 * the chosen segment (`motion.sheet`), or cross-fades there under Reduce Motion.
 */
export function Segmented<T extends string>({
  segments,
  value,
  onChange,
  label,
}: {
  readonly segments: readonly Segment<T>[];
  readonly value: T;
  readonly onChange: (value: T) => void;
  /** What is being chosen, for VoiceOver. */
  readonly label: string;
}) {
  const { palette } = useTheme();
  const reduce = useReduceMotion();
  const [width, setWidth] = useState(0);
  const index = Math.max(
    0,
    segments.findIndex((s) => s.value === value),
  );
  const x = useSharedValue(0);
  const shown = useSharedValue(1);
  const segmentWidth = width > 0 ? (width - PAD * 2) / segments.length : 0;
  const target = index * segmentWidth;
  const placed = useRef(false);
  useEffect(() => {
    if (segmentWidth === 0) return;
    if (!placed.current) {
      // The first position is where it starts, not somewhere it travels to.
      placed.current = true;
      x.set(target);
    } else if (reduce) {
      shown.set(0);
      x.set(target);
      shown.set(fadeTo(1));
    } else {
      x.set(sheetTo(target, false));
    }
  }, [segmentWidth, target, reduce, x, shown]);
  const thumb = useAnimatedStyle(() => ({
    transform: [{ translateX: x.get() }],
    opacity: shown.get(),
  }));
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={label}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      style={{
        flexDirection: 'row',
        padding: PAD,
        borderRadius: radii.tile,
        backgroundColor: palette.segment.track,
      }}
    >
      {segmentWidth > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              top: PAD,
              bottom: PAD,
              left: PAD,
              width: segmentWidth,
              borderRadius: 9,
              backgroundColor: palette.segment.thumb,
              boxShadow: palette.segment.shadow,
            },
            thumb,
          ]}
        />
      ) : null}
      {segments.map((s) => (
        <Press
          key={s.value}
          darken={false}
          onPress={() => {
            if (s.value === value) return;
            haptics.select();
            onChange(s.value);
          }}
          accessibilityRole="tab"
          accessibilityLabel={s.label}
          accessibilityState={{ selected: s.value === value }}
          style={{ flex: 1, minHeight: 32, alignItems: 'center', justifyContent: 'center' }}
        >
          <Txt variant="segment" align="center" numberOfLines={2}>
            {s.label}
          </Txt>
        </Press>
      ))}
    </View>
  );
}
