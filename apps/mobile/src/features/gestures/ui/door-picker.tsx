import { day } from '@kithfield/theme';
import { useImperativeHandle, useRef, type ComponentRef, type Ref } from 'react';
import { ScrollView, View } from 'react-native';

import { ArtLoop } from '../../../ui/art/art-view';
import { useLocale } from '../../../ui/locale/locale-provider';
import { Press } from '../../../ui/motion/press';
import { useTheme } from '../../../ui/theme/theme-provider';
import type { Friend } from '../model/people';

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Finds where the picked door is on screen now, for something to fly to it. */
export interface DoorPickerHandle {
  measurePicked(): Promise<Rect | null>;
}

const W = 64;
const H = 82;

/**
 * Friends' doors in a row: each critter's own door, the chosen one ringed in honey and lit
 * by the firefly when `lit`. Five fit across; more scroll sideways.
 */
export function DoorPicker({
  friends,
  picked,
  onPick,
  lit = false,
  ref,
}: {
  readonly friends: readonly Friend[];
  readonly picked: string | null;
  readonly onPick: (person: string) => void;
  readonly lit?: boolean;
  readonly ref?: Ref<DoorPickerHandle>;
}) {
  const { t } = useLocale();
  const { palette } = useTheme();
  const refs = useRef(new Map<string, ComponentRef<typeof View> | null>());
  useImperativeHandle(ref, () => ({
    measurePicked: () =>
      new Promise<Rect | null>((resolve) => {
        const view = picked === null ? undefined : refs.current.get(picked);
        if (!view) return resolve(null);
        view.measureInWindow((x: number, y: number, width: number, height: number) =>
          resolve({ x, y, width, height }),
        );
      }),
  }));
  const doors = friends.map((f) => {
    const on = f.person === picked;
    return (
      <Press
        key={f.person}
        onPress={() => onPick(f.person)}
        haptic="select"
        radius={16}
        accessibilityRole="radio"
        accessibilityState={{ selected: on }}
        accessibilityLabel={t('gestures.doors.door', { name: f.name ?? t('gestures.aFriend') })}
        style={{
          width: W,
          height: H,
          borderRadius: 16,
          boxShadow: on
            ? `0 0 0 2.5px ${palette.sheet}, 0 0 0 4.5px ${day.honey}`
            : `0 0 0 1px ${palette.hairline}`,
        }}
      >
        <View
          ref={(v) => {
            refs.current.set(f.person, v);
          }}
          style={{ width: W, height: H, borderRadius: 16, overflow: 'hidden' }}
        >
          <ArtLoop
            scene="door"
            width={W}
            height={H}
            attrs={{ kind: f.kind, firefly: lit && on }}
            paused={!(lit && on)}
          />
        </View>
      </Press>
    );
  });
  if (friends.length <= 5) {
    return (
      <View
        accessibilityRole="radiogroup"
        style={{
          flexDirection: 'row',
          justifyContent: friends.length < 5 ? 'flex-start' : 'space-between',
          gap: friends.length < 5 ? 12 : 0,
          paddingVertical: 5,
        }}
      >
        {doors}
      </View>
    );
  }
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityRole="radiogroup"
      contentContainerStyle={{ gap: 12, paddingVertical: 5, paddingHorizontal: 5 }}
      style={{ marginHorizontal: -5 }}
    >
      {doors}
    </ScrollView>
  );
}
