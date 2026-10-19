import type { FarmId } from '@kithfield/contracts';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';

import { setLeaveRoom } from '../../features/fire/fire-chrome';
import { FireRoomScreen, type FireControls } from '../../features/fire/fire-room';
import { useDesk } from './desk-context';
import { useDeskKey } from './desk-keys';

/**
 * The fire room in the right pane (14-15), in place of the farm while you sit by it; the chat
 * stays usable beside it. ⌥⌘M mutes, ⌥⌘L heads home, and Space talks while held with the pane
 * in focus. Heading home brings the farm back.
 */
export function DeskFire({ farm }: { readonly farm: FarmId }) {
  const desk = useDesk();
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const controls = useRef<FireControls | null>(null);
  const pane = useRef<ComponentRef<typeof View>>(null);

  useEffect(() => {
    setLeaveRoom(() => desk.setFire(false));
    return () => setLeaveRoom(null);
  }, [desk]);

  useDeskKey('mute', () => controls.current?.toggleMic());
  useDeskKey('fire', () => controls.current?.headHome());

  // Push to talk: Space held while the pane has focus opens the mic, letting go closes it.
  useEffect(() => {
    // In the browser a view is its DOM element.
    const node = pane.current as unknown as HTMLElement | null;
    if (!node) return;
    let held = false;
    const down = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || held || e.repeat) return;
      e.preventDefault();
      held = true;
      controls.current?.toggleMic();
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || !held) return;
      held = false;
      controls.current?.toggleMic();
    };
    node.tabIndex = 0;
    node.addEventListener('keydown', down);
    node.addEventListener('keyup', up);
    return () => {
      node.removeEventListener('keydown', down);
      node.removeEventListener('keyup', up);
    };
  }, []);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((s) => (s && s.width === width && s.height === height ? s : { width, height }));
  };
  return (
    <View ref={pane} style={{ flex: 1 }} onLayout={onLayout}>
      {size ? (
        <FireRoomScreen
          farm={farm}
          size={size}
          onControls={(c) => {
            controls.current = c;
          }}
        />
      ) : null}
    </View>
  );
}
