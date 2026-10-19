import type { ChatListItem, Critter, PersonId } from '@kithfield/contracts';
import { ColorMatrix, Canvas, Image as SkImage } from '@shopify/react-native-skia';
import { useEffect } from 'react';
import { Platform, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { ArtStill } from '../../../ui/art/art-view';
import { useArtStill } from '../../../ui/art/art-provider';
import { Avatar } from '../../../ui/art/avatar';
import { useLocale } from '../../../ui/locale/locale-provider';
import { haptics } from '../../../ui/motion/haptics';
import { fadeTo, sheetTo } from '../../../ui/motion/motion';
import { Press } from '../../../ui/motion/press';
import { useReduceMotion } from '../../../ui/motion/reduce-motion';
import { useTabDot } from '../../../ui/tab-bar/tab-activity';
import { useTheme } from '../../../ui/theme/theme-provider';
import { Txt } from '../../../ui/type/text';
import { hasNews } from '../model/chat-list';
import { listTime } from '../model/format';
import { lookOf } from '../model/people';
import { useChatColours } from '../ui/chat-colours';
import { useSeenTo } from '../ui/seen-store';
import { useRowFacts, useRowLine } from './row-data';

const THUMB = 52;
const ACTION = 76;

/** Saturation 0.6, as the design greys a dozing farm's thumbnail (`filter: saturate(.6)`). */
const SATURATE_06 = (() => {
  const s = 0.6;
  const r = 0.2126;
  const g = 0.7152;
  const b = 0.0722;
  return [
    r + (1 - r) * s,
    g - g * s,
    b - b * s,
    0,
    0,
    r - r * s,
    g + (1 - g) * s,
    b - b * s,
    0,
    0,
    r - r * s,
    g - g * s,
    b + (1 - b) * s,
    0,
    0,
    0,
    0,
    0,
    1,
    0,
  ];
})();

function DozingStill({ season }: { readonly season: string }) {
  const image = useArtStill({ scene: 'strip', width: THUMB, height: THUMB, attrs: { season } });
  return (
    <Canvas style={{ width: THUMB, height: THUMB }}>
      <SkImage image={image} x={0} y={0} width={THUMB} height={THUMB}>
        <ColorMatrix matrix={SATURATE_06} />
      </SkImage>
    </Canvas>
  );
}

function FarmThumb({ season, dozing }: { readonly season: string; readonly dozing: boolean }) {
  return (
    <View style={{ width: THUMB, height: THUMB, borderRadius: 16, overflow: 'hidden' }}>
      {dozing ? (
        <DozingStill season={season} />
      ) : (
        <ArtStill scene="strip" width={THUMB} height={THUMB} attrs={{ season }} />
      )}
    </View>
  );
}

/** A visit shows both critters: theirs top left, yours bottom right. */
function VisitThumb({ peer, mine }: { readonly peer: Critter; readonly mine: Critter | null }) {
  const { palette } = useTheme();
  return (
    <View style={{ width: THUMB, height: THUMB }}>
      <Avatar
        kind={peer.species}
        look={lookOf(peer)}
        size={36}
        ring={palette.card}
        style={{ position: 'absolute', left: 0, top: 0 }}
      />
      {mine ? (
        <Avatar
          kind={mine.species}
          look={lookOf(mine)}
          size={36}
          ring={palette.card}
          style={{ position: 'absolute', right: 0, bottom: 0 }}
        />
      ) : null}
    </View>
  );
}

export interface ChatRowProps {
  readonly row: ChatListItem;
  readonly me: PersonId | null;
  readonly myCritter: Critter | null;
  readonly now: number;
  /** The row whose actions are showing; opening one closes the others. */
  readonly open: boolean;
  readonly onOpen: (farm: string | null) => void;
  readonly onPress: () => void;
  readonly onMute: () => void;
  readonly onPin: () => void;
}

/**
 * One chat: the farm's land or both critters, its name, what was said last, when, and a honey dot
 * for something new. Swipe left for mute and pin to top.
 */
export function ChatRow(props: ChatRowProps) {
  const { row, me, myCritter, now, open, onOpen, onPress, onMute, onPin } = props;
  const { palette } = useTheme();
  const colours = useChatColours();
  const { t, language } = useLocale();
  const reduce = useReduceMotion();
  const facts = useRowFacts(row.farm, now);
  const line = useRowLine(row, facts, me);
  // News after what this phone has shown of the chat lights the dot; the mark never leaves the phone.
  const news = hasNews(row, me, useSeenTo(row.farm));
  // The Chats tab carries a honey dot while any unmuted chat has news.
  useTabDot('chat', news && !row.muted);
  const title =
    row.farmKind === 'visit' ? (row.with?.name ?? t('chat.friendWhoLeft')) : (row.name ?? '');
  const x = useSharedValue(0);
  const start = useSharedValue(0);
  const width = ACTION * 2;
  useEffect(() => {
    const to = open ? -width : 0;
    if (x.get() !== to) x.set(reduce ? fadeTo(to) : sheetTo(to, false));
  }, [open, reduce, width, x]);
  const pan = usePanGesture({
    activeOffsetX: [-12, 12],
    failOffsetY: [-10, 10],
    onBegin: () => {
      'worklet';
      start.set(x.get());
    },
    onUpdate: (e) => {
      'worklet';
      const next = start.get() + e.translationX;
      x.set(next > 0 ? next * 0.2 : Math.max(next, -width - (Math.abs(next) - width) * 0.8));
    },
    onDeactivate: (e) => {
      'worklet';
      const opening = x.get() < -width / 2 || e.velocityX < -400;
      const closing = e.velocityX > 400;
      const to = opening && !closing ? -width : 0;
      x.set(reduce ? fadeTo(to) : sheetTo(to, false, e.velocityX));
      scheduleOnRN(onOpen, to === 0 ? null : row.farm);
    },
  });
  const slide = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));
  const actions = useAnimatedStyle(() => ({ opacity: Math.min(1, -x.get() / 40) }));
  const act = (fn: () => void) => () => {
    haptics.tap();
    onOpen(null);
    fn();
  };
  const label = [
    title,
    line,
    listTime(row.at, now, language),
    news ? t('chat.list.somethingNew') : '',
  ]
    .filter(Boolean)
    .join(', ');
  return (
    <View style={{ overflow: 'hidden' }}>
      <Animated.View
        style={[
          { position: 'absolute', top: 0, bottom: 0, right: 0, width, flexDirection: 'row' },
          actions,
        ]}
      >
        <Press
          onPress={act(onMute)}
          accessibilityLabel={row.muted ? t('chat.list.unmute') : t('chat.list.mute')}
          style={{
            width: ACTION,
            backgroundColor: colours.muteAction,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Txt variant="buttonSmall" color={colours.actionInk}>
            {row.muted ? t('chat.list.unmute') : t('chat.list.mute')}
          </Txt>
        </Press>
        <Press
          onPress={act(onPin)}
          accessibilityLabel={row.pinned ? t('chat.list.unpin') : t('chat.list.pin')}
          style={{
            width: ACTION,
            backgroundColor: colours.pinAction,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Txt variant="buttonSmall" color={colours.actionInk} align="center">
            {row.pinned ? t('chat.list.unpin') : t('chat.list.pin')}
          </Txt>
        </Press>
      </Animated.View>
      <GestureDetector gesture={pan}>
        <Animated.View
          accessible
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityActions={[
            { name: 'activate' },
            { name: 'mute', label: row.muted ? t('chat.list.unmute') : t('chat.list.mute') },
            { name: 'pin', label: row.pinned ? t('chat.list.unpin') : t('chat.list.pin') },
          ]}
          onAccessibilityAction={(e) => {
            const name = e.nativeEvent.actionName;
            if (name === 'activate') onPress();
            if (name === 'mute') onMute();
            if (name === 'pin') onPin();
          }}
          style={[{ backgroundColor: palette.background }, slide]}
        >
          <Press
            onPress={open ? () => onOpen(null) : onPress}
            darken={false}
            accessible={false}
            // The row around it is the button; in a browser a button can't hold another one.
            {...(Platform.OS === 'web' ? { accessibilityRole: 'none' as const } : {})}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              paddingVertical: 11,
              minHeight: 44,
              borderBottomWidth: 1,
              borderBottomColor: colours.rowRule,
            }}
          >
            {row.farmKind === 'visit' && row.with ? (
              <VisitThumb peer={row.with.critter} mine={myCritter} />
            ) : (
              <FarmThumb season={facts.season} dozing={facts.misty} />
            )}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt variant="rowTitle" numberOfLines={1}>
                {title}
              </Txt>
              <Txt
                variant="rowSubtitle"
                color={palette.secondary}
                numberOfLines={1}
                style={{ marginTop: 2 }}
              >
                {line}
              </Txt>
            </View>
            {/* The time and the honey dot under it, centred together: with a dot the time sits
                level with the name, without one it sits mid-row. */}
            <View style={{ alignItems: 'flex-end', gap: 6 }}>
              <Txt variant="caption" color={palette.secondary} style={{ fontSize: 13 }}>
                {listTime(row.at, now, language)}
              </Txt>
              {news ? (
                <View
                  style={{ width: 9, height: 9, borderRadius: 4.5, backgroundColor: palette.honey }}
                />
              ) : null}
            </View>
          </Press>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
