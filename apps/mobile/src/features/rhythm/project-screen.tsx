import type { FarmId } from '@kithfield/contracts';
import type { FarmView } from '@kithfield/farm';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { rhythmColours } from '@kithfield/theme';

import { useFarm, useFarmView, useOpenFarm } from '../../data';
import { ArtStill } from '../../ui/art/art-view';
import { Segmented } from '../../ui/components/segmented';
import { useLocale } from '../../ui/locale/locale-provider';
import { fadeTo } from '../../ui/motion/motion';
import { useTheme } from '../../ui/theme/theme-provider';
import { Txt } from '../../ui/type/text';
import { NightVeil, Panel } from '../farm/panel';
import { backToFarm } from '../farm/routes';
import { typeAt } from '../farm/type-at';
import { useNow } from '../farm/use-now';
import { ActionButton, Faces, TitlePill, TopBar } from './chrome';
import { handText, say } from './copy';
import { captionKey, projectKeys, projectProgress, type ProjectWhen } from './project-copy';

const W = 393;
const ART_H = 470;

/**
 * The farm's long restoration project: how far it has come, and a look at tonight's step. One
 * step a night after anyone tends; nobody has to do anything special.
 */
export function ProjectScreen({ farm }: { readonly farm: FarmId }) {
  const { t, fontLocale } = useLocale();
  const { palette, appearance } = useTheme();
  const colours = rhythmColours[appearance];
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const k = width / W;
  const now = useNow();
  useOpenFarm(farm);
  const state = useFarm(farm)?.state ?? null;
  const view = useFarmView<FarmView>(farm, now);
  const project = view?.restoration ?? null;
  const [when, setWhen] = useState<ProjectWhen>('today');
  // Tonight's look fades in over today's: the scaffolding goes, the new glass is there.
  const tonight = useSharedValue(0);
  useEffect(() => {
    tonight.set(fadeTo(when === 'tonight' ? 1 : 0));
  }, [when, tonight]);
  const tonightStyle = useAnimatedStyle(() => ({ opacity: tonight.get() }));

  const keys = projectKeys(project?.project ?? 'greenhouse');
  const scene = project?.scene ?? 'barn';
  const season = state?.season.season ?? 'spring';
  const artH = ART_H * k;
  const critters = (state?.members ?? []).slice(0, 5).map((m) => m.critter);

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <View style={{ position: 'absolute', top: 0, left: 0, width, height: artH }}>
        <ArtStill
          scene={scene}
          width={width}
          height={artH}
          attrs={{ progress: project ? projectProgress(project, 'today') : 0, season }}
          t={1.2}
        />
        <Animated.View style={[{ position: 'absolute', top: 0, left: 0 }, tonightStyle]}>
          <ArtStill
            scene={scene}
            width={width}
            height={artH}
            attrs={{
              progress: project ? projectProgress(project, 'tonight') : 0,
              night: true,
              season,
            }}
            t={1.2}
          />
        </Animated.View>
        <NightVeil width={width} height={artH} />
      </View>
      <TopBar
        top={insets.top - 1}
        onBack={() => router.back()}
        center={<TitlePill title={say(t, keys.name)} />}
      />
      <Panel top={436 * k} style={{ paddingHorizontal: 20 }}>
        <Txt variant="displayM" multiline accessibilityRole="header">
          {say(t, keys.title)}
        </Txt>
        <Txt variant="sheetBody" multiline color={palette.body}>
          {say(t, keys.body)}
        </Txt>
        {project && !project.finished ? (
          <Segmented<ProjectWhen>
            label={t('rhythm.project.view')}
            value={when}
            onChange={setWhen}
            segments={[
              { value: 'today', label: t('rhythm.project.today') },
              { value: 'tonight', label: t('rhythm.project.tonight') },
            ]}
          />
        ) : null}
        <View
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <Txt
            variant="handL"
            color={colours.hand}
            multiline
            style={[typeAt('handL', 18, 18, fontLocale), { flex: 1 }]}
          >
            {project ? handText(say(t, captionKey(project, when))) : ''}
          </Txt>
          <Faces critters={critters} size={24} ring={palette.sheet} overlap={7} />
        </View>
      </Panel>
      <View style={{ position: 'absolute', left: 24, right: 24, bottom: 34 }}>
        <ActionButton
          label={t('rhythm.backToFarm')}
          onPress={backToFarm}
          bg={palette.primary.bg}
          fg={palette.primary.fg}
        />
      </View>
    </View>
  );
}
