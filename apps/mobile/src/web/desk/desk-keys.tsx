import { router } from 'expo-router';
import type { ChatListItem } from '@kithfield/contracts';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { useCottage } from '../../data';
import { sectionsOf } from '../../features/chat/model/chat-list';
import { routes as gestureRoutes } from '../../features/gestures/routes';
import { useLocale } from '../../ui/locale/locale-provider';
import { motion } from '@kithfield/theme';
import { useReduceMotion } from '../../ui/motion/reduce-motion';
import { useTheme } from '../../ui/theme/theme-provider';
import { Txt } from '../../ui/type/text';
import { openChat, useDesk, type Desk } from './desk-context';
import { KeyCap } from './key-cap';
import { actionOf, shortcutRows, type DeskAction } from './keymap';

/** Handlers a pane offers for a shortcut while it shows (the chat's dewdrop, the fire's mute). */
const handlers = new Map<DeskAction, Set<() => void>>();

/** Offers `run` for a shortcut while the calling view is mounted; the newest one answers. */
export function useDeskKey(action: DeskAction, run: () => void): void {
  const latest = useRef(run);
  latest.current = run;
  useEffect(() => {
    const call = () => latest.current();
    const set = handlers.get(action) ?? new Set();
    set.add(call);
    handlers.set(action, set);
    return () => {
      set.delete(call);
    };
  }, [action]);
}

const offered = (action: DeskAction): (() => void) | null => {
  const set = handlers.get(action);
  return set && set.size > 0 ? ([...set].at(-1) ?? null) : null;
};

export const isMac = (): boolean =>
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** What the shortcuts act on, kept by the mounted `DeskKeys`. */
let current: {
  readonly desk: Desk;
  readonly chats: readonly ChatListItem[];
  readonly toggleList: () => void;
} | null = null;

/**
 * Does what a shortcut (or the desktop's Farm menu) asks. A shortcut a pane offers goes to that
 * pane; the rest open their screens.
 */
export function runDeskAction(action: DeskAction, index = 0): void {
  if (!current) return;
  const { desk, chats, toggleList } = current;
  const farm = desk.farm;
  const own = offered(action);
  switch (action) {
    case 'list':
      toggleList();
      return;
    case 'jump': {
      const { farms, visits } = sectionsOf(chats);
      const row = [...farms, ...visits][index];
      if (row) openChat(row.farm);
      return;
    }
    case 'search':
      router.push({ pathname: '/(cover)/chat-search', params: farm ? { farm } : {} });
      return;
    case 'quickTend':
      router.push('/(modal)/gestures-quick-tend');
      return;
    case 'firefly':
      if (farm) router.push(gestureRoutes.firefly(farm));
      return;
    case 'fire':
      if (own) own();
      else if (farm) desk.setFire(!desk.fire);
      return;
    case 'dewdrop':
    case 'seed':
    case 'mute':
      own?.();
      return;
  }
}

/**
 * The desktop's shortcuts, listened for on the whole window, and the list of them (⌘/), which
 * closes on Esc, a click outside it, or ⌘/ again.
 */
export function DeskKeys() {
  const desk = useDesk();
  const { chats } = useCottage();
  const [list, setList] = useState(false);
  const mac = useMemo(isMac, []);
  current = { desk, chats, toggleList: () => setList((on) => !on) };
  useEffect(
    () => () => {
      current = null;
    },
    [],
  );

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setList(false);
        return;
      }
      const hit = actionOf(
        { key: e.key, meta: e.metaKey, ctrl: e.ctrlKey, shift: e.shiftKey, alt: e.altKey },
        mac,
      );
      if (!hit) return;
      e.preventDefault();
      runDeskAction(hit.action, hit.index);
    };
    // Heard on the way down: a text field (React Native for Web's) stops its key presses from
    // bubbling, and the composer is where the keys are mostly pressed.
    window.addEventListener('keydown', down, true);
    return () => window.removeEventListener('keydown', down, true);
  }, [mac]);

  return list ? <ShortcutList mac={mac} onClose={() => setList(false)} /> : null;
}

function ShortcutList({ mac, onClose }: { readonly mac: boolean; readonly onClose: () => void }) {
  const { t } = useLocale();
  const { palette } = useTheme();
  const reduce = useReduceMotion();
  const fade = reduce ? undefined : motion.fade.durationMs;
  return (
    <Animated.View
      {...(fade ? { entering: FadeIn.duration(fade), exiting: FadeOut.duration(fade) } : {})}
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50 }}
    >
      <Pressable
        onPress={onClose}
        accessibilityLabel={t('platforms.keys.close')}
        style={{
          flex: 1,
          backgroundColor: palette.scrim,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Pressable
          onPress={() => undefined}
          accessibilityRole="none"
          style={{
            width: 640,
            maxWidth: '92%',
            borderRadius: 28,
            backgroundColor: palette.card,
            boxShadow: '0 30px 60px -20px rgba(30,20,10,0.45)',
            paddingTop: 26,
            paddingBottom: 20,
            paddingHorizontal: 24,
          }}
        >
          <Txt variant="displayL" accessibilityRole="header" style={{ marginBottom: 12 }}>
            {t('platforms.keys.title')}
          </Txt>
          {shortcutRows(mac).map((row) => (
            <View
              key={row.copy}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                minHeight: 46,
                borderBottomWidth: 1,
                borderColor: palette.hairline,
              }}
            >
              <View style={{ width: 150, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {row.keys.map((k, i) => (
                  <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    {i > 0 ? <Txt color={palette.secondary}>–</Txt> : null}
                    <KeyCap keys={k} />
                  </View>
                ))}
              </View>
              <Txt variant="body" style={{ flex: 1, fontSize: 16 }}>
                {t(row.copy as 'platforms.keys.list')}
              </Txt>
            </View>
          ))}
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}
