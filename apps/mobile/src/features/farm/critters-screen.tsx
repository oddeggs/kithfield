import type { FarmId } from '@kithfield/contracts';
import type { FarmView } from '@kithfield/farm';
import { router } from 'expo-router';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useFarm, useFarmView } from '../../data';
import { ArtStill } from '../../ui/art/art-view';
import { Avatar } from '../../ui/art/avatar';
import { Button, CircleButton } from '../../ui/components/button';
import { useLocale } from '../../ui/locale/locale-provider';
import { Press } from '../../ui/motion/press';
import { useSession } from '../../ui/session/session';
import { useTheme } from '../../ui/theme/theme-provider';
import { Txt } from '../../ui/type/text';
import { castOf, lookOf } from './farm-bake';
import { crowdLine } from './farm-copy';
import { GlyphButton, Panel } from './panel';
import { farmRoutes } from './routes';
import { useNow } from './use-now';

const W = 393;

/**
 * Who lives here (04-05): every critter on the farm in a grid, how each one is, and a way to
 * invite someone or leave a firefly for a friend who's dozing.
 */
export function CrittersScreen({ farm }: { readonly farm: FarmId }) {
  const { t } = useLocale();
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const k = width / W;
  const now = useNow();
  const me = useSession().person?.id ?? null;
  const state = useFarm(farm)?.state ?? null;
  const view = useFarmView<FarmView>(farm, now);
  if (!state || !view) return <View style={{ flex: 1, backgroundColor: palette.background }} />;

  const members = [...state.members].sort((a, b) =>
    a.person === me ? -1 : b.person === me ? 1 : a.joinedAt - b.joinedAt,
  );
  const sleepy = new Set(view.critters.filter((c) => c.sleepy).map((c) => c.person));
  const dressed = members.some((m) => m.critter.outfit || m.critter.accessory);
  const critters = crowdLine(
    t,
    members.map((m) => m.critter.species),
  );
  const sleeper = members.find((m) => m.person !== me && sleepy.has(m.person));
  const tileWidth = (width - 36 - 3 * 8) / 4;

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <ArtStill
        scene="crowd"
        width={width}
        height={236 * k}
        attrs={{
          season: view.season.season,
          cast: members.map((m) => castOf(m.critter, sleepy.has(m.person))).join(','),
        }}
      />
      <GlyphButton
        glyph="‹"
        label={t('farm.back')}
        side="left"
        top={insets.top - 1}
        onPress={() => router.back()}
      />
      <View style={{ position: 'absolute', top: insets.top - 1, right: 16 }}>
        <CircleButton
          icon="plus"
          kind="glass"
          label={t('farm.crowd.invite')}
          onPress={() => router.push(farmRoutes.farmSettings(farm))}
        />
      </View>
      <Panel top={214 * k} style={{ paddingHorizontal: 0 }}>
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 18,
            gap: 12,
            paddingBottom: insets.bottom + 24,
          }}
          showsVerticalScrollIndicator={false}
        >
          <Txt variant="displayM" multiline accessibilityRole="header">
            {t('farm.crowd.title', { count: members.length })}
          </Txt>
          <Txt variant="sheetBody" multiline color={palette.body}>
            {t(dressed ? 'farm.crowd.dressed' : 'farm.crowd.plain', { critters })}
          </Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {members.map((m) => {
              const mine = m.person === me;
              const asleep = sleepy.has(m.person);
              const word = asleep
                ? t('farm.state.dozing')
                : m.battery === 'resting'
                  ? t('farm.crowd.resting')
                  : t('farm.crowd.out');
              const name = mine ? t('farm.crowd.you') : (m.name ?? t('farm.someone'));
              return (
                <Press
                  key={m.person}
                  onPress={() =>
                    router.push(mine ? farmRoutes.bubble(farm) : farmRoutes.critter(farm, m.person))
                  }
                  radius={20}
                  accessibilityLabel={`${name}, ${word}`}
                  style={{
                    width: tileWidth,
                    alignItems: 'center',
                    gap: 5,
                    paddingTop: 10,
                    paddingBottom: 9,
                    paddingHorizontal: 2,
                    borderRadius: 20,
                    backgroundColor: palette.card,
                    borderWidth: 1,
                    borderColor: palette.cardBorder,
                  }}
                >
                  <Avatar
                    kind={m.critter.species}
                    look={lookOf(m.critter)}
                    {...(asleep ? { state: 'sleep' as const } : {})}
                    size={50}
                  />
                  <Txt
                    variant="rowTitle"
                    style={{ fontSize: 14, lineHeight: 16 }}
                    numberOfLines={1}
                  >
                    {name}
                  </Txt>
                  <Txt
                    variant="handS"
                    style={{ fontSize: 13, lineHeight: 14 }}
                    color={asleep ? palette.muted : palette.go.bg}
                    numberOfLines={1}
                  >
                    {word}
                  </Txt>
                </Press>
              );
            })}
          </View>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
            <Button
              label={t('farm.crowd.invite')}
              icon="door"
              kind="secondary"
              size="medium"
              style={{ flex: 1 }}
              onPress={() => router.push(farmRoutes.farmSettings(farm))}
            />
            {sleeper ? (
              <Button
                label={t('farm.crowd.firefly')}
                icon="firefly"
                kind="secondary"
                size="medium"
                style={{ flex: 1 }}
                onPress={() => router.push(farmRoutes.tray(farm, sleeper.person))}
              />
            ) : null}
          </View>
        </ScrollView>
      </Panel>
    </View>
  );
}
