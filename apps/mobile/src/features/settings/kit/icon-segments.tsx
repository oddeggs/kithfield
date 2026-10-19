import { useEffect, useRef, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { ArtIcon } from '../../../ui/art/art-view';
import { haptics } from '../../../ui/motion/haptics';
import { fadeTo, sheetTo } from '../../../ui/motion/motion';
import { Press } from '../../../ui/motion/press';
import { useReduceMotion } from '../../../ui/motion/reduce-motion';
import { useTheme } from '../../../ui/theme/theme-provider';
import { KText } from './text';

export interface IconSegment<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly icon: string;
  /** The icon's own ink; omitted, it keeps the art's colours. */
  readonly iconColor?: string;
}

const PAD = 3;

/**
 * The social battery's two-way switch: a 14-radius track, 36-point segments with an
 * icon, and a raised card that springs to the chosen one (`motion.sheet`), or fades there under
 * Reduce Motion.
 */
export function IconSegments<T extends string>({
  segments,
  value,
  onChange,
  label,
}: {
  readonly segments: readonly IconSegment<T>[];
  readonly value: T;
  readonly onChange: (value: T) => void;
  readonly label: string;
}) {
  const { palette } = useTheme();
  const reduce = useReduceMotion();
  const [width, setWidth] = useState(0);
  const index = Math.max(
    0,
    segments.findIndex((s) => s.value === value),
  );
  const segmentWidth = width > 0 ? (width - PAD * 2) / segments.length : 0;
  const x = useSharedValue(0);
  const shown = useSharedValue(1);
  const placed = useRef(false);
  useEffect(() => {
    if (segmentWidth === 0) return;
    const target = index * segmentWidth;
    if (!placed.current) {
      placed.current = true;
      x.set(target);
    } else if (reduce) {
      shown.set(0);
      x.set(target);
      shown.set(fadeTo(1));
    } else {
      x.set(sheetTo(target, false));
    }
  }, [segmentWidth, index, reduce, x, shown]);
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
        borderRadius: 14,
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
              borderRadius: 11,
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
          hitSlop={{ top: 4, bottom: 4 }}
          accessibilityRole="tab"
          accessibilityLabel={s.label}
          accessibilityState={{ selected: s.value === value }}
          style={{
            flex: 1,
            minHeight: 36,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
          }}
        >
          <ArtIcon name={s.icon} size={s.iconColor ? 16 : 18} color={s.iconColor ?? ''} />
          <KText kind="pill" style={{ fontSize: 14, lineHeight: 17 }} numberOfLines={1}>
            {s.label}
          </KText>
        </Press>
      ))}
    </View>
  );
}
