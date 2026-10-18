import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { View, ViewProps } from 'react-native';
import Animated, {
  useAnimatedRef,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';

import type { Box } from './geometry';
import type { AnchorId } from './registry';
import type { SpriteSpec } from './sprite';
import { useTravelRegistry } from './travel-host';

/**
 * Whether the drawing registered as `id` shows: 1, or 0 while its copy is in the air. For art the
 * feature draws itself (a critter on a Skia canvas), as that drawing's opacity.
 */
export function useTravelShown(id: AnchorId): SharedValue<number> {
  return useTravelShownAll(useMemo(() => [id], [id]))[0] as SharedValue<number>;
}

interface Measurable {
  measureInWindow(done: (x: number, y: number, width: number, height: number) => void): void;
}

/** Puts `ref` under `id` while mounted, with the sprite that stands for it. */
function useAttach(id: AnchorId, sprite: SpriteSpec | undefined, sheetTop: number | null = null) {
  const registry = useTravelRegistry();
  const ref = useAnimatedRef<View>();
  const shown = useTravelShown(id);
  useEffect(() => registry.attach(id, ref), [registry, id, ref]);
  useEffect(() => {
    const entry = registry.peek(id);
    if (entry && entry.ref === ref) entry.sheetTop = sheetTop;
  }, [registry, id, ref, sheetTop]);
  // What it looks like may change (a critter re-drawn) without it moving.
  useEffect(() => {
    const entry = registry.peek(id);
    if (entry && entry.ref === ref) entry.sprite = sprite;
  });
  // Where it last laid out on the window, for when it can't be measured on the UI thread (a
  // native sheet on its way out).
  const onLayout = () => {
    const view = ref.current as unknown as Measurable | null;
    view?.measureInWindow((x, y, width, height) => {
      const entry = registry.peek(id);
      if (entry && entry.ref === ref && width > 0) entry.box = { x, y, width, height };
    });
  };
  return { ref, shown, onLayout };
}

/**
 * `useTravelShown` for a list of drawings at once (every critter on a canvas): whether each
 * shows, in the order of `ids`.
 */
export function useTravelShownAll(ids: readonly AnchorId[]): readonly SharedValue<number>[] {
  const registry = useTravelRegistry();
  const key = ids.join('\n');
  // Made (not held) while rendering; held from the effect, so a render that never commits
  // holds nothing.
  const [entries, setEntries] = useState(() => ids.map((id) => registry.ensure(id)));
  const [seen, setSeen] = useState(key);
  if (seen !== key) {
    setSeen(key);
    setEntries(ids.map((id) => registry.ensure(id)));
  }
  useEffect(() => {
    const held = key === '' ? [] : key.split('\n');
    const now = held.map((id) => registry.hold(id));
    // An entry let go of between the render and now was made again: show that one.
    if (now.some((e, i) => e !== entries[i])) setEntries(now);
    return () => {
      for (const id of held) registry.release(id);
    };
    // `key` stands for the ids; `entries` follows it.
  }, [registry, key]);
  return useMemo(() => entries.map((e) => e.shown), [entries]);
}

export interface TravelAnchorProps extends ViewProps {
  /** The id the other end of the travel uses. */
  readonly id: AnchorId;
  /** What it looks like, drawn from the art, for a flight that leaves from it or lands as it. */
  readonly sprite?: SpriteSpec;
  /**
   * Inside a native sheet: where the sheet's top edge sits on the window (the window's height
   * less the sheet's). A sheet's views measure from the sheet's own corner.
   */
  readonly sheetTop?: number;
  readonly children?: ReactNode;
}

/**
 * A view art can travel from or to: measured by the flight on the UI thread and hidden while its
 * copy is in the air (its children fade to 0 and back).
 */
export function TravelAnchor({
  id,
  sprite,
  sheetTop,
  style,
  children,
  onLayout,
  ...rest
}: TravelAnchorProps) {
  const attached = useAttach(id, sprite, sheetTop ?? null);
  const { ref, shown } = attached;
  const hide = useAnimatedStyle(() => ({ opacity: shown.get() }));
  return (
    <Animated.View
      ref={ref}
      collapsable={false}
      {...rest}
      onLayout={(e) => {
        attached.onLayout();
        onLayout?.(e);
      }}
      style={[style, hide]}
    >
      {children}
    </Animated.View>
  );
}

/**
 * An invisible box art can travel from or to, for drawings a feature paints itself (a critter on
 * the farm canvas): `box` is in the parent's points. Hide that drawing with `useTravelShown(id)`.
 */
export function TravelSpot({
  id,
  box,
  sprite,
}: {
  readonly id: AnchorId;
  readonly box: Box;
  readonly sprite?: SpriteSpec;
}) {
  const { ref, onLayout } = useAttach(id, sprite);
  return (
    <Animated.View
      ref={ref}
      onLayout={onLayout}
      collapsable={false}
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: box.x,
        top: box.y,
        width: box.width,
        height: box.height,
      }}
    />
  );
}
