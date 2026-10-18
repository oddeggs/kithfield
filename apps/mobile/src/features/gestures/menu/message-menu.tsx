import { gestureMotion } from '@kithfield/theme';
import { router, useLocalSearchParams } from 'expo-router';
import { BlurView } from 'expo-blur';
import * as Clipboard from 'expo-clipboard';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  useAnimatedKeyboard,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDataClient } from '../../../data';
import { useToast } from '../../../ui/components/toast';
import { useLocale } from '../../../ui/locale/locale-provider';
import { fadeTo, sheetTo } from '../../../ui/motion/motion';
import { useReduceMotion } from '../../../ui/motion/reduce-motion';
import { useTheme } from '../../../ui/theme/theme-provider';
import { Txt } from '../../../ui/type/text';
import {
  dewdropped,
  menuActions,
  menuDeadlines,
  myReaction,
  reactionWrite,
  reactionsPicked,
  shownText,
  type MenuAction,
} from '../model/message';
import { DEWDROP, isKnownReaction, quickReactions, type TrayReaction } from '../model/reactions';
import { open, routes } from '../routes';
import { useGestureRejections, useGestureSend } from '../send';
import { useOverlayClose } from '../ui/presentation';
import { seqParam, useDeadlines, useGestureFarm } from '../use-gesture-farm';
import { LiftedBubble } from './lifted-bubble';
import { EditCard, MenuCard, useMenuSurface } from './menu-card';
import { MeaningLabel, ReactionPill } from './reaction-pill';
import { useGestureColours } from '../ui/colours';

const AnimatedBlur = Animated.createAnimatedComponent(BlurView);
/** The background blurs to about 12 points. */
const BLUR = 32;
/** The bubble lifts toward you. */
const LIFT = gestureMotion.menuLift;
/** The tray grows from the bubble, 0.9 to 1. */
const TRAY_FROM = gestureMotion.menuTrayFrom;
/** A pick settles in two drawings before the menu goes. */
const SETTLE_MS = 166;

/**
 * The long-press menu over a message: the chat behind blurs, the message lifts, and above
 * it the reaction tray, below it what you can do. A dewdrop is a `dewdrop` event on the message;
 * the others are `reaction`s, one per person, and tapping yours again takes it back.
 */
export function MessageMenu() {
  const { t } = useLocale();
  const { palette } = useTheme();
  const gc = useGestureColours();
  const reduce = useReduceMotion();
  const toast = useToast();
  const client = useDataClient();
  const insets = useSafeAreaInsets();
  const screen = useWindowDimensions();
  const params = useLocalSearchParams<{ seq?: string; top?: string }>();
  const seq = seqParam(params.seq) ?? 0;
  const anchor = Number(params.top);
  const g = useGestureFarm();
  const send = useGestureSend(g.farm);
  useGestureRejections();
  const { closing, close } = useOverlayClose();
  const [editing, setEditing] = useState(false);
  const [focus, setFocus] = useState<TrayReaction | null>(null);
  const [header, setHeader] = useState(0);
  const [height, setHeight] = useState(0);
  const surface = useMenuSurface();

  const event = g.events.find((e) => e.seq === seq) ?? null;
  // A message older than what the phone holds is paged in once.
  useEffect(() => {
    if (event === null && seq > 0 && g.events.length > 0) {
      void client.pageHistory(g.farm, seq + 1, 5).catch(() => undefined);
    }
  }, [event, seq, g.events.length, g.farm, client]);

  const me = g.me ?? '';
  const mine = event?.actor === me;
  const text = event ? shownText(event, g.events) : null;
  const current = event ? myReaction(g.events, g.pending, seq, me) : null;
  const dewed = event ? dewdropped(g.events, g.pending, seq, me) : false;
  useDeadlines(event ? menuDeadlines(event) : []);
  const quick = useMemo(() => quickReactions(reactionsPicked(g.events, me)), [g.events, me]);
  const chosen = new Set<TrayReaction>();
  if (dewed) chosen.add(DEWDROP);
  if (current && isKnownReaction(current)) chosen.add(current);
  const shownFocus = focus ?? [...chosen][0] ?? DEWDROP;
  const actions = event
    ? menuActions({
        event,
        me,
        text,
        pinned: g.pins.includes(seq),
        can: (write) => g.can(write)?.ok ?? false,
      })
    : [];

  const shown = useSharedValue(0);
  const lift = useSharedValue(1);
  const tray = useSharedValue(reduce ? 1 : TRAY_FROM);
  useEffect(() => {
    const target = closing ? 0 : 1;
    shown.set(fadeTo(target));
    lift.set(sheetTo(closing ? 1 : LIFT, reduce));
    tray.set(sheetTo(closing ? TRAY_FROM : 1, reduce));
  }, [closing, reduce, shown, lift, tray]);
  const blurProps = useAnimatedProps(() => ({ intensity: shown.get() * BLUR }));
  const tint = useAnimatedStyle(() => ({ opacity: shown.get() }));
  const bubbleStyle = useAnimatedStyle(() => ({ transform: [{ scale: lift.get() }] }));
  const trayStyle = useAnimatedStyle(() => ({
    opacity: shown.get(),
    transform: [{ scale: tray.get() }],
  }));

  const pick = async (id: TrayReaction) => {
    if (!event) return;
    const write = reactionWrite({ id, target: seq, events: g.events, pending: g.pending, me });
    // A dewdrop already left (in the log or still in the outbox) is never written twice.
    if (!write) return;
    const ok = await send(write.kind, write.payload, id === DEWDROP ? { haptic: 'soft' } : {});
    if (ok) setTimeout(() => close(), SETTLE_MS);
  };

  const act = async (action: MenuAction) => {
    if (!event) return;
    switch (action) {
      case 'reply':
        return close(() => router.navigate(routes.reply(g.farm, seq)));
      case 'edit':
        return setEditing(true);
      case 'pin':
      case 'unpin': {
        const on = action === 'pin';
        const sent = on ? t('gestures.sent.pinned') : t('gestures.sent.unpinned');
        if (await send('pin', { target: seq, on }, { sent, icon: 'pin' })) close();
        return;
      }
      case 'plant':
        return close(() => open(routes.plant(g.farm, seq)));
      case 'copy':
        await Clipboard.setStringAsync(text ?? '');
        toast.show(t('gestures.sent.copied'));
        return close();
      case 'forward':
        return close(() => open(routes.forward(g.farm, seq)));
      case 'unsend':
        if (await send('unsend', { target: seq }, { sent: t('gestures.sent.unsent') })) close();
        return;
      case 'report':
        return close(() => open(routes.report(g.farm, seq)));
    }
  };

  const save = async (words: string) => {
    if (await send('edit', { target: seq, text: words }, { sent: t('gestures.sent.edited') }))
      close();
  };

  // Where the column sits: the message where it was in the chat, when the chat said so, kept on
  // screen with its menu; otherwise in the middle.
  const room = screen.height - insets.bottom - 8;
  const wanted = Number.isFinite(anchor) ? anchor - header : (screen.height - height) / 2;
  const top = Math.max(insets.top + 8, Math.min(wanted, room - height));
  // While editing, the column rises just enough to keep the field above the keyboard.
  const keyboard = useAnimatedKeyboard();
  const below = screen.height - (top + height) - 8;
  const column = useAnimatedStyle(() => ({
    transform: [{ translateY: -Math.max(0, keyboard.height.get() - below) }],
  }));

  return (
    <View style={StyleSheet.absoluteFill}>
      <AnimatedBlur
        animatedProps={blurProps}
        tint={palette.appearance === 'day' ? 'light' : 'dark'}
        style={StyleSheet.absoluteFill}
      />
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: gc.menuTint }, tint]} />
      <Pressable
        style={StyleSheet.absoluteFill}
        accessibilityRole="button"
        accessibilityLabel={t('gestures.close')}
        onPress={() => close()}
      />
      <Animated.View
        onLayout={(e) => setHeight(e.nativeEvent.layout.height)}
        style={[
          {
            position: 'absolute',
            top,
            left: 18,
            right: 18,
            gap: 10,
            alignItems: mine ? 'flex-end' : 'flex-start',
            opacity: height === 0 ? 0 : 1,
          },
          column,
        ]}
      >
        <Animated.View
          onLayout={(e) => setHeader(e.nativeEvent.layout.height + 10)}
          style={[{ gap: 10, transformOrigin: mine ? 'right bottom' : 'left bottom' }, trayStyle]}
        >
          {event ? <MeaningLabel reaction={shownFocus} /> : null}
          {event ? (
            <ReactionPill
              items={quick}
              chosen={chosen}
              focus={shownFocus}
              onPick={(id) => void pick(id)}
              onFocus={setFocus}
              onMore={() => close(() => open(routes.reactions(g.farm, seq)))}
            />
          ) : null}
        </Animated.View>
        <Animated.View style={[{ marginTop: 6 }, bubbleStyle]}>
          {event ? (
            <LiftedBubble
              mine={mine}
              from={g.friend(event.actor)}
              text={text ?? t(`gestures.quickTend.preview.${previewOf(event.kind)}`)}
            />
          ) : (
            <View style={[surface, { padding: 16 }]}>
              <Txt variant="caption" multiline color={palette.secondary}>
                {t('gestures.menu.missing')}
              </Txt>
            </View>
          )}
        </Animated.View>
        <Animated.View style={[{ marginLeft: mine ? 0 : 38 }, trayStyle]}>
          {editing && text !== null ? (
            <EditCard
              initial={text}
              onSave={(w) => void save(w)}
              onCancel={() => setEditing(false)}
            />
          ) : actions.length > 0 ? (
            <MenuCard actions={actions} onAction={(a) => void act(a)} />
          ) : null}
        </Animated.View>
      </Animated.View>
    </View>
  );
}

/** What a message without words is, for the lifted bubble. */
const previewOf = (kind: string): 'media' | 'voice' | 'other' =>
  kind === 'media' ? 'media' : kind === 'voice' ? 'voice' : 'other';
