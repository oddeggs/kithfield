import { gestureMotion } from '@kithfield/theme';
import { useEffect, type ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { Avatar } from '../../ui/art/avatar';
import { useLocale } from '../../ui/locale/locale-provider';
import { fadeTo } from '../../ui/motion/motion';
import { Press } from '../../ui/motion/press';
import { useTheme } from '../../ui/theme/theme-provider';
import { Txt } from '../../ui/type/text';
import type { Friend } from './model/people';
import { repliesFor, type QuickReply, type QuickTendItem } from './model/quick-tend';

/** A sent card fades to 72%. */
const SENT_OPACITY = gestureMotion.sentCardOpacity;

function QuickChip({
  label,
  sent,
  onPress,
}: {
  readonly label: string;
  readonly sent: boolean;
  readonly onPress: () => void;
}) {
  const { palette } = useTheme();
  return (
    <Press
      onPress={onPress}
      haptic={sent ? 'select' : 'soft'}
      radius={17}
      accessibilityLabel={label}
      accessibilityState={{ selected: sent }}
      hitSlop={5}
      style={{
        minHeight: 34,
        paddingHorizontal: 13,
        borderRadius: 17,
        justifyContent: 'center',
        backgroundColor: sent ? palette.go.bg : palette.chip.suggestionBg,
      }}
    >
      <Txt variant="buttonSmall" color={sent ? palette.bubble.yoursFg : palette.chip.suggestionFg}>
        {label}
      </Txt>
    </Press>
  );
}

/**
 * One waiting thing: who, why, what they said, and a few gentle answers. Tapping one sends
 * it and dims the card; tapping the sent answer again in the next few seconds takes it back.
 */
export function QuickTendCard({
  item,
  who,
  sent,
  onReply,
  onUndo,
  stickers,
  stickerSent = false,
}: {
  readonly item: QuickTendItem;
  readonly who: Friend | null;
  readonly sent: QuickReply | null;
  readonly onReply: (reply: QuickReply) => void;
  readonly onUndo: () => void;
  /** Sticker answers beside the chips (08-03); hidden once words are sent. */
  readonly stickers?: ReactNode;
  /** A sticker answer was sent: the card dims and its chips step aside. */
  readonly stickerSent?: boolean;
}) {
  const { t } = useLocale();
  const { palette } = useTheme();
  const done = sent !== null || stickerSent;
  const dim = useSharedValue(done ? SENT_OPACITY : 1);
  useEffect(() => {
    dim.set(fadeTo(done ? SENT_OPACITY : 1));
  }, [done, dim]);
  const style = useAnimatedStyle(() => ({ opacity: dim.get() }));
  const name = who?.name ?? item.with?.name ?? item.name ?? t('gestures.aFriend');
  const preview =
    item.preview ??
    t(
      `gestures.quickTend.preview.${item.kind === 'media' ? 'media' : item.kind === 'voice' ? 'voice' : item.kind === 'seed_planted' ? 'plan' : 'other'}`,
    );
  return (
    <Animated.View
      style={[
        {
          borderRadius: 22,
          backgroundColor: palette.card,
          borderWidth: 1,
          borderColor: palette.cardBorder,
          paddingVertical: 10,
          paddingHorizontal: 14,
          gap: 8,
        },
        style,
      ]}
    >
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
        <Avatar
          kind={who?.kind ?? item.with?.critter.species ?? 'rabbit'}
          look={who?.look ?? {}}
          size={36}
        />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt
            variant="bubbleName"
            color={palette.muted}
            style={{ fontSize: 13, lineHeight: 15.6 }}
          >
            {t('gestures.quickTend.who', { name, why: t(`gestures.quickTend.why.${item.why}`) })}
          </Txt>
          <Txt
            variant="bubble"
            multiline
            style={{ fontSize: 15.5, lineHeight: 21.08, marginTop: 2 }}
          >
            {preview}
          </Txt>
        </View>
      </View>
      <View
        style={{
          flexDirection: 'row',
          gap: 6,
          flexWrap: 'wrap',
          alignItems: 'center',
          paddingLeft: 46,
        }}
        accessibilityLiveRegion="polite"
      >
        {stickerSent ? null : sent ? (
          <QuickChip
            label={t('gestures.quickTend.sent', {
              reply: t(`gestures.quickTend.reply.${sent.words}`),
            })}
            sent
            onPress={onUndo}
          />
        ) : (
          repliesFor(item).map((r) => (
            <QuickChip
              key={`${r.kind}:${r.words}`}
              label={t(`gestures.quickTend.reply.${r.words}`)}
              sent={false}
              onPress={() => onReply(r)}
            />
          ))
        )}
      </View>
      {sent ? null : stickers}
    </Animated.View>
  );
}

/** How long a sent answer can be taken back. */
export const UNDO_MS = 5000;
