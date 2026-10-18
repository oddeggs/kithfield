import type { FarmId } from '@kithfield/contracts';
import type { FarmView } from '@kithfield/farm';
import { router } from 'expo-router';
import { useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCottage, useFarm, useFarmView } from '../../data';
import { ArtIcon, ArtStill } from '../../ui/art/art-view';
import { Button, CircleButton } from '../../ui/components/button';
import { CritterStack } from '../../ui/components/card';
import { Glass } from '../../ui/components/glass';
import { useLocale } from '../../ui/locale/locale-provider';
import { Press } from '../../ui/motion/press';
import { useReduceMotion } from '../../ui/motion/reduce-motion';
import { useArtVisible } from '../../ui/motion/visibility';
import { useSession } from '../../ui/session/session';
import { tabBarClearance } from '../../ui/tab-bar/tab-bar';
import { useTheme } from '../../ui/theme/theme-provider';
import { Txt } from '../../ui/type/text';
import { lookOf } from './farm-bake';
import { overArt } from './over-art';
import { NightVeil } from './panel';
import { backToFarm, farmRoutes } from './routes';
import { useBob } from './speech-bubble';
import { useNow } from './use-now';
import { useValley, type FarmRow } from './valley-store';

/** The valley scene's five islands, and where each one's label sits (04-17), on 393 by 640. */
const ISLANDS = [
  { x: 106, y: 192 },
  { x: 287, y: 269 },
  { x: 141, y: 378 },
  { x: 291, y: 480 },
  { x: 110, y: 570 },
] as const;

const SCENE_W = 393;
const SCENE_H = 640;

/** Who on a farm is out (awake), as far as this phone has seen it. */
function useOut(farm: FarmId) {
  const now = useNow();
  const me = useSession().person?.id ?? null;
  const state = useFarm(farm)?.state ?? null;
  const view = useFarmView<FarmView>(farm, now);
  if (!state || !view) return null;
  // Friends who are out; you are, since you're looking.
  const out = view.critters
    .filter((c) => !c.sleepy && c.person !== me)
    .flatMap((c) => {
      const m = state.members.find((x) => x.person === c.person);
      return m ? [{ name: m.name ?? '', kind: m.critter.species, look: lookOf(m.critter) }] : [];
    });
  return { out, all: state.members.length };
}

function IslandLabel({
  farm,
  at,
  here,
  scale,
  screen,
  running,
  phase,
  onPress,
}: {
  readonly farm: FarmRow;
  readonly at: { x: number; y: number };
  readonly here: boolean;
  readonly scale: number;
  readonly screen: number;
  readonly running: boolean;
  readonly phase: number;
  readonly onPress: () => void;
}) {
  const { t } = useLocale();
  const { palette } = useTheme();
  const people = useOut(farm.farm);
  const bob = useBob(running, phase);
  const out = people?.out ?? [];
  const names = out.map((o) => o.name);
  const line =
    people === null
      ? null
      : out.length === 0
        ? t('farm.valley.dozing')
        : out.length === 1
          ? t('farm.valley.out.one', { a: names[0] ?? '' })
          : out.length === 2
            ? t('farm.valley.out.two', { a: names[0] ?? '', b: names[1] ?? '' })
            : out.length === 3
              ? t('farm.valley.out.three', {
                  a: names[0] ?? '',
                  b: names[1] ?? '',
                  c: names[2] ?? '',
                })
              : t('farm.valley.out.many', { a: names[0] ?? '', b: names[1] ?? '' });
  const fg = here ? overArt.inkFg : overArt.ink;
  // Centred on the island's spot once its width is known, and kept on the screen.
  const [w, setW] = useState(0);
  const left = Math.min(screen - w - 8, Math.max(8, at.x * scale - w / 2));
  return (
    <Animated.View
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      style={[{ position: 'absolute', left, top: at.y * scale, opacity: w ? 1 : 0 }, bob]}
      pointerEvents="box-none"
    >
      <Press
        onPress={onPress}
        haptic="select"
        radius={17}
        accessibilityLabel={line ? `${farm.name ?? ''}, ${line}` : (farm.name ?? '')}
        accessibilityState={{ selected: here }}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingVertical: 5,
          paddingLeft: out.length > 0 ? 5 : 9,
          paddingRight: 11,
          borderRadius: 17,
          backgroundColor: here ? overArt.ink : overArt.paper,
          boxShadow: overArt.shadow,
        }}
      >
        {out.length > 0 ? (
          <CritterStack
            friends={out.slice(0, 3)}
            size={22}
            ring={here ? overArt.ink : palette.panel}
          />
        ) : people ? (
          <ArtIcon name="moon" size={16} color={palette.muted} />
        ) : null}
        <View>
          <Txt variant="bubbleName" style={{ fontSize: 13, lineHeight: 15 }} color={fg}>
            {farm.name ?? ''}
          </Txt>
          {line ? (
            <Txt variant="handS" style={{ fontSize: 13, lineHeight: 13, opacity: 0.8 }} color={fg}>
              {line}
            </Txt>
          ) : null}
        </View>
      </Press>
    </Animated.View>
  );
}

/** The valley in the open farm's season, as a still: looped whole, it is over the art's budget. */
function ValleyArt({ farm, width, height }: { farm: FarmId; width: number; height: number }) {
  const season = useFarm(farm)?.state?.season.season ?? 'spring';
  return (
    <View style={{ width, height }}>
      <ArtStill scene="valley" width={width} height={height} attrs={{ season }} />
      <NightVeil width={width} height={height} />
    </View>
  );
}

function ValleyCard({ farm, onGo }: { readonly farm: FarmRow; readonly onGo: () => void }) {
  const { t } = useLocale();
  const { palette } = useTheme();
  const { chats } = useCottage();
  const people = useOut(farm.farm);
  const preview = chats.find((c) => c.farm === farm.farm)?.preview ?? null;
  return (
    <Glass
      radius={34}
      fill={palette.glassButton.fill}
      border={palette.glassButton.border}
      shadow={palette.sheetShadow}
      style={{ paddingVertical: 16, paddingHorizontal: 18, gap: 12 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {people && people.out.length > 0 ? (
          <CritterStack friends={people.out.slice(0, 3)} size={32} ring={palette.panel} />
        ) : null}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt variant="displayS" style={{ fontSize: 19, lineHeight: 21 }} numberOfLines={1}>
            {farm.name ?? ''}
          </Txt>
          <Txt variant="rowSubtitle" color={palette.secondary} numberOfLines={2}>
            {preview ?? t('farm.valley.quiet')}
          </Txt>
        </View>
      </View>
      <Button label={t('farm.valley.go')} onPress={onGo} size="medium" style={{ minHeight: 50 }} />
    </Glass>
  );
}

/**
 * The valley (04-17): every farm you live on, each on its own island down the river. Tap one to
 * see it in the card below and go there; + plants a new one.
 */
export function ValleyScreen() {
  const { t } = useLocale();
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const visible = useArtVisible();
  const reduce = useReduceMotion();
  const valley = useValley();
  const [picked, setPicked] = useState<FarmId | null>(null);
  const scale = width / SCENE_W;
  const shown = valley.farms.slice(0, ISLANDS.length);
  const selected = valley.farms.find((f) => f.farm === (picked ?? valley.current)) ?? null;

  const go = async (farm: FarmId) => {
    await valley.choose(farm);
    backToFarm();
  };

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      {valley.current ? (
        <ValleyArt farm={valley.current} width={width} height={SCENE_H * scale} />
      ) : (
        <ArtStill
          scene="valley"
          width={width}
          height={SCENE_H * scale}
          attrs={{ season: 'spring' }}
        />
      )}
      {shown.map((f, i) => {
        const at = ISLANDS[i];
        return at ? (
          <IslandLabel
            key={f.farm}
            farm={f}
            at={at}
            here={f.farm === (picked ?? valley.current)}
            scale={scale}
            screen={width}
            running={visible && !reduce}
            phase={(i * 0.23) % 1}
            onPress={() => setPicked(f.farm)}
          />
        ) : null;
      })}
      <View
        style={{
          position: 'absolute',
          top: insets.top + 1,
          left: 16,
          right: 16,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
        pointerEvents="box-none"
      >
        <Glass
          radius={22}
          fill={palette.glassButton.fill}
          border={palette.glassButton.border}
          style={{ paddingVertical: 10, paddingHorizontal: 18 }}
        >
          <Txt variant="displayS" style={{ fontSize: 18 }} accessibilityRole="header">
            {t('farm.valley.title')}
          </Txt>
        </Glass>
        <CircleButton
          icon="plus"
          kind="glass"
          label={t('farm.valley.plant')}
          onPress={() => router.push(farmRoutes.newFarm())}
        />
      </View>
      {selected ? (
        <View
          style={{
            position: 'absolute',
            left: 12,
            right: 12,
            bottom: tabBarClearance(insets.bottom) - 8,
          }}
        >
          <ValleyCard farm={selected} onGo={() => void go(selected.farm)} />
        </View>
      ) : null}
    </View>
  );
}
