import { day } from '@kithfield/theme';
import { useEffect, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { ArtStill } from '../../ui/art/art-view';
import { useLocale } from '../../ui/locale/locale-provider';
import { useReduceMotion } from '../../ui/motion/reduce-motion';
import { Txt } from '../../ui/type/text';
import { platformLook } from '../look';
import { isMedia } from './dropped-media';

/** How many of what's being dragged are photos or videos (the browser shows types, not files). */
function mediaCount(data: DataTransfer | null): number {
  if (!data) return 0;
  return [...data.items].filter((item) => item.kind === 'file' && isMedia(item.type)).length;
}

/**
 * Photos dragged anywhere onto the chat: the chat dims under a dashed moss edge saying how many
 * will be shared, fading in at 120 ms, and dropping hands the files to `onDrop`.
 */
export function DropZone({
  who,
  season,
  onDrop,
  children,
}: {
  /** Who will love them: the friend on a visit; null on a farm. */
  readonly who: string | null;
  readonly season: string;
  readonly onDrop: (files: globalThis.File[]) => void;
  readonly children: ReactNode;
}) {
  const { t } = useLocale();
  const reduce = useReduceMotion();
  const host = useRef<ComponentRef<typeof View>>(null);
  const [count, setCount] = useState(0);
  const shown = useSharedValue(0);
  const drop = useRef(onDrop);
  drop.current = onDrop;

  useEffect(() => {
    // In the browser a view is its DOM element.
    const node = host.current as unknown as HTMLElement | null;
    if (!node) return;
    let depth = 0;
    const enter = (e: DragEvent) => {
      const n = mediaCount(e.dataTransfer);
      if (n === 0) return;
      e.preventDefault();
      depth += 1;
      setCount(n);
    };
    const over = (e: DragEvent) => {
      if (mediaCount(e.dataTransfer) === 0) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };
    const leave = () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) setCount(0);
    };
    const dropped = (e: DragEvent) => {
      e.preventDefault();
      depth = 0;
      setCount(0);
      const files = [...(e.dataTransfer?.files ?? [])];
      if (files.length > 0) drop.current(files);
    };
    node.addEventListener('dragenter', enter);
    node.addEventListener('dragover', over);
    node.addEventListener('dragleave', leave);
    node.addEventListener('drop', dropped);
    return () => {
      node.removeEventListener('dragenter', enter);
      node.removeEventListener('dragover', over);
      node.removeEventListener('dragleave', leave);
      node.removeEventListener('drop', dropped);
    };
  }, []);

  useEffect(() => {
    shown.set(
      withTiming(count > 0 ? 1 : 0, {
        duration: reduce ? 0 : platformLook.quickFadeMs,
        easing: Easing.linear,
      }),
    );
  }, [count, reduce, shown]);
  const fade = useAnimatedStyle(() => ({ opacity: shown.get() }));

  return (
    <View ref={host} style={{ flex: 1 }}>
      {children}
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            top: 12,
            left: 12,
            right: 12,
            bottom: 12,
            borderRadius: 20,
            borderWidth: 2.5,
            borderStyle: 'dashed',
            borderColor: platformLook.dropEdge,
            backgroundColor: platformLook.dropWash,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            zIndex: 9,
          },
          fade,
        ]}
      >
        <View style={{ width: 220, height: 150 }}>
          <View
            style={{
              position: 'absolute',
              left: 10,
              top: 12,
              borderRadius: 8,
              overflow: 'hidden',
              transform: [{ rotate: '-6deg' }],
            }}
          >
            <ArtStill scene="snap" width={150} height={110} attrs={{ name: 'river', season }} />
          </View>
          <View
            style={{
              position: 'absolute',
              left: 62,
              top: 4,
              borderRadius: 8,
              overflow: 'hidden',
              transform: [{ rotate: '5deg' }],
            }}
          >
            <ArtStill scene="snap" width={150} height={110} attrs={{ name: 'garden', season }} />
          </View>
        </View>
        <Txt variant="displayM" style={{ fontSize: 22, lineHeight: 24.2 }}>
          {t('platforms.drop.title', { count: Math.max(1, count) })}
        </Txt>
        <Txt variant="handS" color={day.moss} style={{ fontSize: 16, lineHeight: 16 }}>
          {who ? t('platforms.drop.body', { name: who }) : t('platforms.drop.bodyFarm')}
        </Txt>
      </Animated.View>
    </View>
  );
}
