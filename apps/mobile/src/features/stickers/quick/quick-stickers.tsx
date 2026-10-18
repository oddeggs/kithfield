import type { StickerPayload } from '@kithfield/contracts';
import { motion } from '@kithfield/theme';
import { View } from 'react-native';
import Animated, { Easing, ZoomIn } from 'react-native-reanimated';

import { useLocale } from '../../../ui/locale/locale-provider';
import { Press } from '../../../ui/motion/press';
import { useReduceMotion } from '../../../ui/motion/reduce-motion';
import { useTheme } from '../../../ui/theme/theme-provider';
import { Txt } from '../../../ui/type/text';
import { sceneOfSticker, type StickerPerson } from '../model/look';
import { StickerArt } from '../ui/sticker';
import { roomy } from '../ui/type';

const STICKER = 80;
const SENT = 60;

/**
 * A Quick Tend card's sticker answers, beside its Write chip: one tap sends (after the card's own
 * grace, so Undo can take it back). Once sent, the sticker shrinks into the card with "sent!".
 * The card itself dims; this row only draws.
 */
export function QuickTendStickers({
  stickers,
  me,
  personOf,
  replyName,
  sent,
  onSend,
  onUndo,
  onWrite,
}: {
  readonly stickers: readonly StickerPayload[];
  /** You, as you look now: the stickers wear your critter. */
  readonly me: StickerPerson | null;
  /** The friends a together sticker draws. */
  readonly personOf: (person: string) => StickerPerson | null;
  /** The name of whoever the card answers, for "hi {name}!". */
  readonly replyName: string | null;
  readonly sent: StickerPayload | null;
  readonly onSend: (sticker: StickerPayload) => void;
  readonly onUndo: () => void;
  readonly onWrite: () => void;
}) {
  const { t } = useLocale();
  const { palette } = useTheme();
  const reduce = useReduceMotion();
  const draw = (s: StickerPayload) => sceneOfSticker(t, s, me, personOf, replyName);

  if (sent) {
    return (
      <View
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 36 }}
        accessibilityLiveRegion="polite"
      >
        <Animated.View
          {...(reduce
            ? {}
            : {
                entering: ZoomIn.duration(motion.fade.durationMs).easing(
                  Easing.bezier(...motion.fade.bezier),
                ),
              })}
        >
          <StickerArt attrs={draw(sent)} size={SENT} />
        </Animated.View>
        <Txt variant="handS" color={palette.go.bg} style={roomy('handS')}>
          {t('stickers.quick.sent')}
        </Txt>
        <View style={{ flex: 1 }} />
        <Press
          onPress={onUndo}
          darken={false}
          hitSlop={12}
          accessibilityLabel={t('stickers.quick.undo')}
        >
          <Txt variant="buttonSmall" color={palette.muted}>
            {t('stickers.quick.undo')}
          </Txt>
        </Press>
      </View>
    );
  }

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, marginLeft: 36 }}>
      {stickers.map((s) => {
        const attrs = draw(s);
        return (
          <Press
            key={`${s.sticker}/${(s.with ?? []).join(',')}`}
            onPress={() => onSend(s)}
            haptic="soft"
            radius={16}
            darken={false}
            accessibilityLabel={t('stickers.quick.reply', { caption: attrs['caption'] ?? '' })}
          >
            <StickerArt attrs={attrs} size={STICKER} />
          </Press>
        );
      })}
      <View style={{ flex: 1 }} />
      <Press
        onPress={onWrite}
        radius={16}
        accessibilityLabel={t('stickers.quick.write')}
        style={{
          height: 32,
          paddingHorizontal: 12,
          borderRadius: 16,
          justifyContent: 'center',
          backgroundColor: palette.chip.suggestionBg,
        }}
      >
        <Txt variant="buttonSmall" color={palette.chip.suggestionFg}>
          {t('stickers.quick.write')}
        </Txt>
      </Press>
    </View>
  );
}
