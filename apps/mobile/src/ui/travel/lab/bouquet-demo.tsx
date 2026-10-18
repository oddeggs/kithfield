import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
  ReduceMotion,
} from 'react-native-reanimated';

import { ArtLoop } from '../../art/art-view';
import { useLocale } from '../../locale/locale-provider';
import { fadeTo, sheetTo } from '../../motion/motion';
import { useReduceMotion } from '../../motion/reduce-motion';
import { useTheme } from '../../theme/theme-provider';
import { TravelAnchor } from '../anchors';
import type { SpriteSpec } from '../sprite';
import { timing } from '../timings';
import { LabNotes, LabStage, useLabFlight } from './kit';

const CARD_H = 120;
const STEM = 90;
const BOUQUET = { width: 170, height: 220 };
/** A folded answer rolled up: one stem, as the bouquet's flowers stand. */
const stemArt: SpriteSpec = {
  scene: 'plant',
  attrs: { name: 'rose', stage: 2, color: 'none' },
  width: STEM,
  height: STEM,
  drawings: 2,
};
const perCard = timing('bouquet', 'perCard');

/** A waiting card that folds like paper when it's answered and unfolds when it's undone. */
function WaitingCard({ id, folded }: { readonly id: string; readonly folded: boolean }) {
  const { palette } = useTheme();
  const reduce = useReduceMotion();
  const fold = useSharedValue(0);
  useEffect(() => {
    const target = folded ? 1 : 0;
    fold.set(
      reduce
        ? fadeTo(target)
        : withTiming(target, { duration: perCard * 0.4, reduceMotion: ReduceMotion.Never }),
    );
  }, [folded, reduce, fold]);
  const style = useAnimatedStyle(() => ({
    opacity: 1 - fold.get() * 0.9,
    transform: [{ scaleY: reduce ? 1 : 1 - fold.get() * 0.75 }],
    height: CARD_H * (1 - fold.get()),
    marginBottom: 12 * (1 - fold.get()),
  }));
  return (
    <Animated.View style={[{ transformOrigin: 'top' }, style]}>
      <TravelAnchor
        id={id}
        style={{
          height: CARD_H,
          borderRadius: 22,
          backgroundColor: palette.card,
          borderWidth: 1,
          borderColor: palette.cardBorder,
        }}
      />
    </Animated.View>
  );
}

/**
 * Quick Tend's bouquet: answer a card and it dims and folds like paper, rolls into a stem that
 * drops into the bouquet, and the bouquet's ribbon wiggles. Undo unrolls it back into its card.
 */
export function BouquetDemo() {
  const { t } = useLocale();
  const reduce = useReduceMotion();
  const { go, current } = useLabFlight();
  const [answered, setAnswered] = useState(0);
  const wiggle = useSharedValue(0);
  const bouquetStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${wiggle.get()}deg` }],
  }));

  const answer = () => {
    if (current.current || answered >= 3) return;
    const card = `lab:card:${answered}`;
    setAnswered(answered + 1);
    go({
      from: card,
      to: 'lab:bouquet',
      sprite: stemArt,
      startFit: 0.25,
      toWidth: STEM * 0.6,
      arc: 40,
      hideSource: false,
      hideTarget: false,
      delayMs: perCard * 0.3,
      durationMs: perCard,
      fade: 'out',
      // One more stem: the ribbon wiggles, 5° one way then 4° the other, on twos.
      onTouchdown: () => {
        if (reduce) return;
        wiggle.set(withTiming(5, { duration: 0 }));
        wiggle.set(withDelay(83, withTiming(-4, { duration: 0 })));
        setTimeout(() => wiggle.set(sheetTo(0, false)), 166);
      },
    });
  };

  const undo = () => {
    if (current.current) {
      current.current.reverse();
      setAnswered(Math.max(0, answered - 1));
      return;
    }
    if (answered === 0) return;
    const card = `lab:card:${answered - 1}`;
    go({
      from: 'lab:bouquet',
      to: card,
      sprite: stemArt,
      fromWidth: STEM * 0.6,
      fit: 0.25,
      arc: 40,
      hideSource: false,
      hideTarget: false,
      durationMs: perCard,
      fade: 'out',
      onTouchdown: () => setAnswered(answered - 1),
    });
  };

  return (
    <View>
      <LabStage>
        <View style={{ paddingHorizontal: 24, paddingTop: 40 }}>
          {[0, 1, 2].map((i) => (
            <WaitingCard key={i} id={`lab:card:${i}`} folded={i < answered} />
          ))}
        </View>
        <Animated.View
          style={[
            { position: 'absolute', left: 112, bottom: 30, transformOrigin: 'bottom' },
            bouquetStyle,
          ]}
        >
          <TravelAnchor id="lab:bouquet" style={{ width: BOUQUET.width, height: BOUQUET.height }}>
            <ArtLoop scene="bouquet" width={BOUQUET.width} height={BOUQUET.height} />
          </TravelAnchor>
        </Animated.View>
      </LabStage>
      <LabNotes
        hint={t('motionLab.bouquet.hint')}
        actions={[
          { label: t('motionLab.bouquet.reply'), onPress: answer },
          { label: t('motionLab.bouquet.undo'), onPress: undo },
        ]}
      />
    </View>
  );
}
