import { motion } from '@kithfield/theme';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { ArtIcon } from '../../ui/art/art-view';
import { useLocale } from '../../ui/locale/locale-provider';
import { fadeTo } from '../../ui/motion/motion';
import { Press } from '../../ui/motion/press';
import { useReduceMotion } from '../../ui/motion/reduce-motion';
import { Txt } from '../../ui/type/text';
import { NameChip, type ChipKind } from './fire-chrome';
import { fireLook } from './look';
import { chipAt, PATH_END, SLOTS } from './seats';

/*
 * What sits over the critters, in the scene's own coordinates so it rises with it: each person's
 * name chip, the critters you can tap to pick who a gesture goes to, gestures floating over whoever
 * got them, and the ring of little lanterns for everyone past the eighth log.
 */

export interface CirclePerson {
  readonly id: string;
  readonly name: string;
  /** Their log, or null for someone sitting as a little lantern past the eighth. */
  readonly seat: number | null;
  readonly chip: ChipKind;
  readonly note?: string;
  readonly label: string;
  readonly level: SharedValue<number>;
  readonly arriving: boolean;
  readonly you: boolean;
}

/** A gesture floating over the critter that got it, for three seconds. */
export interface Float {
  readonly key: string;
  readonly to: string;
  readonly icon: string;
  readonly fromYou: boolean;
}

/** Gestures hang over the critter for three seconds (design notes). */
export const FLOAT_MS = 3000;

function FloatingGesture({
  float,
  x,
  y,
}: {
  readonly float: Float;
  readonly x: number;
  readonly y: number;
}) {
  const { t } = useLocale();
  const reduce = useReduceMotion();
  const scale = useSharedValue(reduce ? 1 : 0);
  const opacity = useSharedValue(reduce ? 0 : 1);
  useEffect(() => {
    const hold = motion.twos.frameMs;
    // Pops in two drawings, held on twos, then fades after three seconds.
    if (reduce) opacity.set(fadeTo(1));
    else
      scale.set(
        withSequence(
          withTiming(0.6, { duration: 0 }),
          withDelay(hold, withTiming(1, { duration: 0 })),
        ),
      );
    opacity.set(withDelay(FLOAT_MS - motion.fade.durationMs, fadeTo(0)));
  }, [scale, opacity, reduce]);
  const style = useAnimatedStyle(() => ({
    opacity: opacity.get(),
    transform: [{ scale: scale.get() }],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: x - 40,
          top: y,
          width: 80,
          alignItems: 'center',
          gap: 2,
          zIndex: 7,
        },
        style,
      ]}
    >
      <ArtIcon name={float.icon} size={34} color={fireLook.primaryInk} />
      {float.fromYou ? (
        <Txt variant="handS" color={fireLook.glyph} style={{ fontSize: 13, lineHeight: 13 }}>
          {t('fire.gesture.fromYou')}
        </Txt>
      ) : null}
    </Animated.View>
  );
}

export function CircleOverlay({
  width,
  height,
  people,
  floats,
  onPick,
  showChips,
}: {
  readonly width: number;
  readonly height: number;
  readonly people: readonly CirclePerson[];
  readonly floats: readonly Float[];
  /** Tapping a critter picks who your next gesture goes to. */
  readonly onPick?: (id: string) => void;
  readonly showChips: boolean;
}) {
  const { t } = useLocale();
  const lanterns = people.filter((p) => p.seat === null);
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', top: 0, left: 0, width, height }}>
      {onPick
        ? people.map((p) => {
            if (p.seat === null || p.you || p.arriving) return null;
            const slot = SLOTS[p.seat];
            if (!slot) return null;
            const s = slot.size * width;
            return (
              <Press
                key={`tap-${p.id}`}
                onPress={() => onPick(p.id)}
                haptic="select"
                darken={false}
                accessibilityLabel={t('fire.gesture.to', { name: p.name })}
                style={{
                  position: 'absolute',
                  left: slot.x * width - s * 0.5,
                  top: slot.y * height - s * 1.1,
                  width: s,
                  height: s * 1.1,
                }}
              />
            );
          })
        : null}
      {showChips
        ? people.map((p) => {
            if (p.seat === null) return null;
            if (p.arriving) {
              return (
                <NameChip
                  key={p.id}
                  name={t('fire.chip.joining', { name: p.name })}
                  kind="plain"
                  label={t('fire.chip.joining', { name: p.name })}
                  x={(PATH_END.x - 0.08) * width}
                  y={0.552 * height}
                />
              );
            }
            const at = chipAt(p.seat);
            return (
              <NameChip
                key={p.id}
                name={p.name}
                kind={p.chip}
                {...(p.note ? { note: p.note } : {})}
                level={p.level}
                label={p.label}
                x={at.x * width}
                y={at.y * height}
              />
            );
          })
        : null}
      {floats.map((f) => {
        const p = people.find((q) => q.id === f.to);
        const slot = p?.seat == null ? null : SLOTS[p.seat];
        if (!slot) return null;
        const s = slot.size * width;
        return (
          <FloatingGesture
            key={f.key}
            float={f}
            x={slot.x * width - s * 0.25}
            y={slot.y * height - s * 1.15}
          />
        );
      })}
      {lanterns.length > 0 ? (
        <View
          pointerEvents="none"
          importantForAccessibility="no-hide-descendants"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0.47 * height,
            flexDirection: 'row',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: 10,
            paddingHorizontal: 40,
          }}
        >
          {lanterns.map((p) => (
            <ArtIcon key={p.id} name="lantern" size={18} color={fireLook.primaryInk} />
          ))}
        </View>
      ) : null}
    </View>
  );
}
