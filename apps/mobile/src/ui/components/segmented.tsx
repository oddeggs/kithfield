import { layout, radii } from '@kithfield/theme';
import { useEffect, useRef, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { haptics } from '../motion/haptics';
import { fadeTo, sheetTo } from '../motion/motion';
import { Press } from '../motion/press';
import { useReduceMotion } from '../motion/reduce-motion';
import { useTheme } from '../theme/theme-provider';
import { useAccessibilitySize } from '../type/accessibility-size';
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
  const stacked = useAccessibilitySize();
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
  const choose = (next: T) => {
    if (next === value) return;
    haptics.select();
    onChange(next);
  };
  if (stacked) {
    // At accessibility sizes the segments stack, each a full row with the chosen one raised.
    return (
      <View
        accessibilityRole="tablist"
        accessibilityLabel={label}
        style={{
          padding: PAD,
          gap: PAD,
          borderRadius: radii.tile,
          backgroundColor: palette.segment.track,
        }}
      >
        {segments.map((s) => (
          <Press
            key={s.value}
            darken={false}
            onPress={() => choose(s.value)}
            accessibilityRole="tab"
            accessibilityLabel={s.label}
            accessibilityState={{ selected: s.value === value }}
            style={[
              { minHeight: layout.minHitTarget, borderRadius: 9, justifyContent: 'center' },
              { paddingHorizontal: 12, paddingVertical: 6 },
              s.value === value
                ? { backgroundColor: palette.segment.thumb, boxShadow: palette.segment.shadow }
                : null,
            ]}
          >
            <Txt variant="segment" multiline>
              {s.label}
            </Txt>
          </Press>
        ))}
      </View>
    );
  }
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
          onPress={() => choose(s.value)}
          // The segment is 32 tall inside a 3-point track: the slop reaches 44.
          hitSlop={{ top: (layout.minHitTarget - 32) / 2, bottom: (layout.minHitTarget - 32) / 2 }}
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
