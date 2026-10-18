import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { ArtIcon } from '../../ui/art/art-view';
import { Chip } from '../../ui/components/chip';
import { useLocale } from '../../ui/locale/locale-provider';
import { useReduceMotion } from '../../ui/motion/reduce-motion';
import { useTheme } from '../../ui/theme/theme-provider';
import { Txt } from '../../ui/type/text';
import { withAlpha } from './colour';
import { batchCounts, itemProgress, type UploadBatch, type UploadItem } from './upload-model';

/*
 * The words around a message going up (the slow-upload state in `12 States`): the line under it ("Sending slowly ·
 * 1 of 4") and the honey card that offers smaller copies when the signal is thin; and the bar in a
 * file's bubble (the file gesture in `05 Gestures`).
 */

/** Under a message on its way: how many of its items are up. */
export function UploadStatusLine({
  batch,
  slow,
}: {
  readonly batch: UploadBatch;
  readonly slow: boolean;
}) {
  const { t } = useLocale();
  const { palette } = useTheme();
  const { done, total } = batchCounts(batch);
  const text = t(slow ? 'media.status.slow' : 'media.status.sending', { done, total });
  return (
    <View
      accessible
      accessibilityLabel={text}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-end' }}
    >
      <ArtIcon name="clock" size={12} color={palette.secondary} />
      <Txt variant="note" medium color={palette.secondary}>
        {text}
      </Txt>
    </View>
  );
}

/**
 * The weak-signal card: what is happening and the way to make it lighter. "Wait for Wi-Fi" shows
 * only when the app can tell Wi-Fi from cellular (`onWaitForWifi`).
 */
export function SlowUploadNotice({
  onSendSmaller,
  onWaitForWifi,
}: {
  readonly onSendSmaller: () => void;
  readonly onWaitForWifi?: () => void;
}) {
  const { t } = useLocale();
  const { palette } = useTheme();
  return (
    <View
      style={{
        // The design draws this card at an 18-point radius, between the tile and the card radii.
        borderRadius: 18,
        backgroundColor: palette.plan.bg,
        paddingVertical: 12,
        paddingHorizontal: 14,
        gap: 10,
      }}
    >
      <View
        accessible
        accessibilityRole="alert"
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
      >
        <ArtIcon name="photo" size={26} color={palette.text} />
        <Txt variant="credit" multiline color={palette.plan.detail} style={{ flex: 1 }}>
          {t('media.slow.body')}
        </Txt>
      </View>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {/* The ink chip at the library's 34 points, as the design draws it. */}
        <Chip label={t('media.slow.smaller')} kind="selected" onPress={onSendSmaller} />
        {onWaitForWifi ? <Chip label={t('media.slow.wifi')} onPress={onWaitForWifi} /> : null}
      </View>
    </View>
  );
}

/** A file's progress inside its bubble: 4 points tall, filling continuously. */
export function UploadBar({ item }: { readonly item: UploadItem }) {
  const reduce = useReduceMotion();
  const { palette } = useTheme();
  const target = itemProgress(item);
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
  const fill = useAnimatedStyle(() => ({ width: `${progress.get() * 100}%` }));
  if (item.phase === 'done') return null;
  return (
    <View
      style={{
        height: 4,
        borderRadius: 2,
        backgroundColor: withAlpha(palette.bubble.yoursFg, 0.3),
        marginTop: 6,
      }}
    >
      <Animated.View
        style={[{ height: 4, borderRadius: 2, backgroundColor: palette.bubble.yoursFg }, fill]}
      />
    </View>
  );
}
