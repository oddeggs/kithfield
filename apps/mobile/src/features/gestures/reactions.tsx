import { useLocalSearchParams } from 'expo-router';
import { useWindowDimensions, View } from 'react-native';

import { ArtIcon } from '../../ui/art/art-view';
import { useLocale } from '../../ui/locale/locale-provider';
import { Press } from '../../ui/motion/press';
import { useTheme } from '../../ui/theme/theme-provider';
import { Txt } from '../../ui/type/text';
import { dewdropped, myReaction } from './model/message';
import { ALL_REACTIONS, DEWDROP, type TrayReaction } from './model/reactions';
import { useGestureSend } from './send';
import { OverlaySheet } from './ui/overlay-sheet';
import { useOverlayClose } from './ui/presentation';
import { seqParam, useGestureFarm } from './use-gesture-farm';

/** The sheet's top edge in the design. */
const SHEET_TOP = 150;

/**
 * Every warm reaction with what it means. Opened on a message, a tap reacts with it: the
 * dewdrop is a `dewdrop` event, the rest `reaction`s, one per person, tapping yours takes it
 * back. Reactions grow nothing; the dewdrop is the tend.
 */
export function ReactionsScreen() {
  const { t } = useLocale();
  const { palette } = useTheme();
  const { height, width } = useWindowDimensions();
  const tile = (width - 40 - 16) / 3;
  const params = useLocalSearchParams<{ seq?: string }>();
  const seq = seqParam(params.seq);
  const g = useGestureFarm();
  const send = useGestureSend(g.farm);
  const { closing, close } = useOverlayClose();
  const me = g.me ?? '';
  const current = seq ? myReaction(g.events, seq, me) : null;
  const dewed = seq ? dewdropped(g.events, seq, me) : false;

  const pick = async (id: TrayReaction) => {
    if (seq === undefined) return;
    if (id === DEWDROP) {
      if (!dewed && !(await send('dewdrop', { target: seq }, { haptic: 'soft' }))) return;
    } else if (
      !(await send(
        'reaction',
        { target: seq, reaction: current === id ? null : id },
        { haptic: 'soft' },
      ))
    ) {
      return;
    }
    close();
  };

  return (
    <OverlaySheet
      height={height - SHEET_TOP}
      closing={closing}
      onClose={() => close()}
      padding={{ top: 10, side: 20, bottom: 0 }}
    >
      <View style={{ gap: 12, marginTop: -2 }}>
        <View
          style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}
        >
          <Txt variant="displayM" accessibilityRole="header" style={{ lineHeight: 29.1 }}>
            {t('gestures.reactions.title')}
          </Txt>
          <Press
            onPress={() => close()}
            darken={false}
            hitSlop={12}
            accessibilityLabel={t('gestures.reactions.done')}
          >
            <Txt variant="buttonText" color={palette.go.bg}>
              {t('gestures.reactions.done')}
            </Txt>
          </Press>
        </View>
        <Txt variant="notice" multiline color={palette.secondary} style={{ marginTop: -4 }}>
          {t('gestures.reactions.body')}
        </Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {ALL_REACTIONS.map((r) => {
            const mineNow = r.id === DEWDROP ? dewed : current === r.id;
            const night = r.tone === 'firefly';
            const bg = night
              ? palette.firefly.bg
              : r.tone === 'dewdrop'
                ? palette.dewdropTint
                : palette.card;
            const fg = night ? palette.firefly.fg : palette.text;
            const meaning = t(`gestures.meaning.${r.id}`);
            return (
              <Press
                key={r.id}
                onPress={() => void pick(r.id)}
                disabled={seq === undefined}
                radius={18}
                accessibilityState={{ selected: mineNow }}
                accessibilityLabel={mineNow ? t('gestures.reaction.picked', { meaning }) : meaning}
                style={{
                  width: tile,
                  alignItems: 'center',
                  gap: 6,
                  paddingVertical: 12,
                  paddingHorizontal: 4,
                  borderRadius: 18,
                  backgroundColor: bg,
                  boxShadow: mineNow ? `0 0 0 2px ${palette.go.bg}` : undefined,
                }}
              >
                <ArtIcon name={r.icon} size={36} color={palette.text} />
                <Txt
                  variant="bubbleState"
                  multiline
                  align="center"
                  color={fg}
                  style={{ fontSize: 12.5, lineHeight: 15 }}
                >
                  {meaning}
                </Txt>
              </Press>
            );
          })}
        </View>
      </View>
    </OverlaySheet>
  );
}
