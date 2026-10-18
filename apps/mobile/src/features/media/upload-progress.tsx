import { day, night } from '@kithfield/theme';
import { Canvas, Circle, Path, Skia } from '@shopify/react-native-skia';
import { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  Easing,
  useDerivedValue,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { Press } from '../../ui/motion/press';
import { useReduceMotion } from '../../ui/motion/reduce-motion';
import { useLocale } from '../../ui/locale/locale-provider';
import { withAlpha } from './colour';
import { itemProgress, type UploadItem } from './upload-model';

/*
 * The ring over an item on its way up (the slow-upload state in `12 States`): the tile dims, a 54-point disc fills
 * clockwise from the top in paper white, and a 44-point dark centre holds the ✕ that stops that
 * item. The fill moves continuously between readings, on the UI thread (the one continuous motion
 * in the app, so progress feels honest). The same over photos by day and night.
 */

const RING = 54;
const CENTRE = 44;
/** Paper white, and the same at 30% for what is still to go. */
const FILL = day.card;
const TRACK = withAlpha(day.card, 0.3);
/** The tile's dimming (the night sky at 32%), and the centre behind the ✕ (ink at 55%). */
const DIM = withAlpha(night.sky, 0.32);
const CENTRE_FILL = withAlpha(day.ink, 0.55);

/** Follows the item's progress: each reading is reached over the time the last one took. */
function useAnimatedProgress(target: number): SharedValue<number> {
  const reduce = useReduceMotion();
  const progress = useSharedValue(target);
  const last = useRef(Date.now());
  useEffect(() => {
    const now = Date.now();
    const gap = Math.min(1000, Math.max(120, now - last.current));
    last.current = now;
    progress.set(
      reduce || target < progress.get()
        ? target
        : withTiming(target, { duration: gap, easing: Easing.linear }),
    );
  }, [target, reduce, progress]);
  return progress;
}

function Wedge({ progress }: { readonly progress: SharedValue<number> }) {
  const path = useDerivedValue(() => {
    const p = Skia.PathBuilder.Make();
    const sweep = 360 * Math.min(1, Math.max(0, progress.get()));
    if (sweep >= 359.9) {
      p.addCircle(RING / 2, RING / 2, RING / 2);
    } else if (sweep > 0) {
      p.moveTo(RING / 2, RING / 2)
        .arcToOval(Skia.XYWHRect(0, 0, RING, RING), -90, sweep, false)
        .close();
    }
    return p.detach();
  });
  return (
    <Canvas style={{ width: RING, height: RING }}>
      <Circle cx={RING / 2} cy={RING / 2} r={RING / 2} color={TRACK} />
      <Path path={path} color={FILL} />
    </Canvas>
  );
}

export interface UploadProgressProps {
  readonly item: UploadItem;
  /** Stops this item; without it the ✕ is not shown. */
  readonly onCancel?: () => void;
}

/**
 * Lay it over a tile (it fills its parent). Shows nothing once the item is up.
 */
export function UploadProgress({ item, onCancel }: UploadProgressProps) {
  const { t } = useLocale();
  const fraction = itemProgress(item);
  const progress = useAnimatedProgress(fraction);
  if (item.phase === 'done') return null;
  const percent = Math.round(fraction * 100);
  return (
    <View
      style={[StyleSheet.absoluteFill, styles.dim]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={
        item.phase === 'waiting' && fraction === 0
          ? t('media.item.waiting')
          : t('media.item.progress', { percent })
      }
      accessibilityValue={{ min: 0, max: 100, now: percent }}
      accessibilityActions={onCancel ? [{ name: 'activate', label: t('media.item.cancel') }] : []}
      {...(onCancel ? { onAccessibilityAction: onCancel } : {})}
    >
      <Wedge progress={progress} />
      <Press
        {...(onCancel ? { onPress: onCancel } : { disabled: true })}
        haptic="tap"
        radius={CENTRE / 2}
        accessibilityLabel={t('media.item.cancel')}
        style={styles.centre}
      >
        {onCancel ? (
          <Text allowFontScaling={false} style={styles.cross}>
            ✕
          </Text>
        ) : null}
      </Press>
    </View>
  );
}

const styles = StyleSheet.create({
  dim: { backgroundColor: DIM, alignItems: 'center', justifyContent: 'center' },
  centre: {
    position: 'absolute',
    width: CENTRE,
    height: CENTRE,
    borderRadius: CENTRE / 2,
    backgroundColor: CENTRE_FILL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cross: { color: FILL, fontSize: 16, lineHeight: 16, fontWeight: '700' },
});
