import { gestureMotion, travel } from '@kithfield/theme';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { ArtIcon } from '../../../ui/art/art-view';
import { useLocale } from '../../../ui/locale/locale-provider';
import { Press } from '../../../ui/motion/press';
import { useReduceMotion } from '../../../ui/motion/reduce-motion';
import { useTheme } from '../../../ui/theme/theme-provider';
import { Txt } from '../../../ui/type/text';
import { DEWDROP, type ReactionMeta, type TrayReaction } from '../model/reactions';
import { useGestureColours } from '../ui/colours';

const BUTTON = 50;
/** A chosen reaction pops to 1.12. */
export const POP = gestureMotion.reactionPop;

/** The hand-lettered line above the tray: the reaction's name and what it means. */
export function MeaningLabel({ reaction }: { readonly reaction: TrayReaction }) {
  const { t } = useLocale();
  const { palette } = useTheme();
  return (
    <View
      style={{
        marginLeft: 22,
        paddingTop: 7,
        paddingBottom: 8,
        paddingHorizontal: 12,
        borderRadius: 14,
        // Ink on paper by day, moon at night: the library's notice colours.
        backgroundColor: palette.notice.bg,
        alignSelf: 'flex-start',
      }}
    >
      <Txt variant="handS" color={palette.notice.fg}>
        {t('gestures.reaction.label', {
          name: t(`gestures.reactionName.${reaction}`),
          meaning: t(`gestures.meaning.${reaction}`),
        })}
      </Txt>
    </View>
  );
}

function ReactionButton({
  item,
  chosen,
  lit,
  onPress,
  onFocus,
}: {
  readonly item: ReactionMeta;
  readonly chosen: boolean;
  /** Drawn popped and tinted: yours, or the one the label above explains. */
  readonly lit: boolean;
  readonly onPress: (id: TrayReaction) => void;
  readonly onFocus: (id: TrayReaction) => void;
}) {
  const { t } = useLocale();
  const { palette } = useTheme();
  const reduce = useReduceMotion();
  const pop = useSharedValue(lit ? POP : 1);
  useEffect(() => {
    const to = lit ? POP : 1;
    pop.set(
      reduce
        ? to
        : withTiming(to, { duration: travel.drawingSwapMs, reduceMotion: ReduceMotion.Never }),
    );
  }, [lit, pop, reduce]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: pop.get() }] }));
  const bg =
    item.tone === 'firefly'
      ? palette.firefly.bg
      : lit
        ? item.id === DEWDROP
          ? palette.dewdropTint
          : palette.fillSoft
        : 'transparent';
  const meaning = t(`gestures.meaning.${item.id}`);
  // A dewdrop left stays left: care given isn't taken back, so it can't be tapped again.
  const given = item.id === DEWDROP && chosen;
  const label = given
    ? t('gestures.reaction.dewdropGiven')
    : chosen
      ? t('gestures.reaction.picked', { meaning })
      : meaning;
  return (
    <Press
      onPress={() => {
        // The pick pops, then settles in two drawings, on twos.
        if (!reduce) {
          const step = { duration: travel.drawingSwapMs, reduceMotion: ReduceMotion.Never };
          pop.set(withSequence(withTiming(POP * 1.06, step), withTiming(POP, step)));
        }
        onFocus(item.id);
        onPress(item.id);
      }}
      haptic="soft"
      disabled={given}
      radius={BUTTON / 2}
      accessibilityRole="button"
      accessibilityState={{ selected: chosen }}
      accessibilityLabel={label}
    >
      <Animated.View
        style={[
          {
            width: BUTTON,
            height: BUTTON,
            borderRadius: BUTTON / 2,
            backgroundColor: bg,
            alignItems: 'center',
            justifyContent: 'center',
          },
          style,
        ]}
      >
        <ArtIcon name={item.icon} size={item.id === 'wave' ? 34 : 36} color={palette.text} />
      </Animated.View>
    </Press>
  );
}

/**
 * The long-press tray: the dewdrop first, then the reactions picked most, then "more" for
 * all twelve. The one you have on the message sits popped and tinted.
 */
export function ReactionPill({
  items,
  chosen,
  focus,
  onPick,
  onFocus,
  onMore,
}: {
  readonly items: readonly ReactionMeta[];
  readonly chosen: ReadonlySet<TrayReaction>;
  /** The reaction the label explains, drawn popped when none is yours yet. */
  readonly focus: TrayReaction;
  readonly onPick: (id: TrayReaction) => void;
  readonly onFocus: (id: TrayReaction) => void;
  readonly onMore: () => void;
}) {
  const { t } = useLocale();
  const { palette } = useTheme();
  const gc = useGestureColours();
  return (
    <View
      accessibilityRole="toolbar"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        padding: 6,
        borderRadius: 32,
        backgroundColor: gc.menuSurface,
        boxShadow: gc.menuShadow,
        alignSelf: 'flex-start',
      }}
    >
      {items.map((item) => (
        <ReactionButton
          key={item.id}
          item={item}
          chosen={chosen.has(item.id)}
          lit={chosen.size > 0 ? chosen.has(item.id) : item.id === focus}
          onPress={onPick}
          onFocus={onFocus}
        />
      ))}
      <Press
        onPress={onMore}
        haptic="select"
        radius={BUTTON / 2}
        accessibilityLabel={t('gestures.menu.more')}
        style={{ width: 36, height: BUTTON, alignItems: 'center', justifyContent: 'center' }}
      >
        <ArtIcon name="more" size={22} color={palette.secondary} />
      </Press>
    </View>
  );
}
