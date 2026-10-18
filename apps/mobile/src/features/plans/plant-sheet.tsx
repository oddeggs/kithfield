import type { FarmId, LocalDate, Seq, Yeses } from '@kithfield/contracts';
import { fontFor, type } from '@kithfield/theme';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDataClient, useOpenFarm } from '../../data';
import { Button } from '../../ui/components/button';
import { Chip } from '../../ui/components/chip';
import { useToast } from '../../ui/components/toast';
import { useLocale } from '../../ui/locale/locale-provider';
import { haptics } from '../../ui/motion/haptics';
import { Press } from '../../ui/motion/press';
import { useTheme } from '../../ui/theme/theme-provider';
import { Txt } from '../../ui/type/text';
import { canPlant, draftStage, placeSuggestions, plantPayload, titleFrom } from './draft';
import { leave } from './chrome';
import { personOn } from './people';
import { ConditionCard, DayChoices, PlaceChoice, YesesChoice } from './plan-sections';
import { usePlanLook } from './plan-look';
import { SeedArt } from './seed-art';
import { useMessage } from './use-message';
import { plantAndJoin } from './planted';
import { plantedStore, useMe, usePlan, usePlantedAnswers } from './use-plans';
import type { BedFarm } from './use-seed-bed';

const STAGE_CAPTIONS = ['plans.stage.0', 'plans.stage.1', 'plans.stage.2', 'plans.stage.3'] as const;

/**
 * Planting a plan: a title, a day, a place and how many yeses it needs. The seed grows a
 * stage per condition as they are met, the way the farm will count them.
 */
export function PlantSheet({
  farm,
  fromSeq,
  farms,
  onFarm,
}: {
  readonly farm: FarmId;
  readonly fromSeq: Seq | null;
  /** The farms a plan started here (not from a message) may be planted on. */
  readonly farms: readonly BedFarm[];
  readonly onFarm: (farm: FarmId) => void;
}) {
  useOpenFarm(farm);
  usePlantedAnswers();
  const { palette } = useTheme();
  const look = usePlanLook();
  const { t, fontLocale } = useLocale();
  const insets = useSafeAreaInsets();
  const client = useDataClient();
  const { show } = useToast();
  const me = useMe();
  const here = usePlan(farm, null);
  const message = useMessage(farm, fromSeq);

  const [title, setTitle] = useState('');
  const [days, setDays] = useState<LocalDate[]>([]);
  const [place, setPlace] = useState('');
  const [yeses, setYeses] = useState<Yeses>('most');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (message) setTitle((current) => current || titleFrom(message.text));
  }, [message]);

  const state = here?.state ?? null;
  const today = here?.view.today ?? null;
  const you = state && me ? personOn(state, me, me, t) : null;
  const draft = { title, days, place, yeses };
  const stage = draftStage(draft, state?.members.length ?? 1, you ? 1 : 0);
  const suggestions = useMemo(() => placeSuggestions(state?.seeds ?? []), [state?.seeds]);
  const author =
    message?.actor && state ? personOn(state, message.actor, me, t).name : null;

  const plant = async (someday: boolean) => {
    if (!me || busy || !canPlant(draft)) return;
    setBusy(true);
    const result = await plantAndJoin(client, plantedStore, farm, me, {
      ...plantPayload(draft, { fromSeq: fromSeq ?? undefined, someday }),
    }).catch(() => null);
    setBusy(false);
    if (result?.status !== 'queued') {
      show(t('plans.refused'));
      return;
    }
    haptics.success();
    leave();
  };

  const titleFont = fontFor(type.displayM, fontLocale);
  return (
    <View style={{ flex: 1, backgroundColor: palette.sheet }}>
      <ScrollView
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingTop: 14,
          paddingHorizontal: 20,
          paddingBottom: 34 + 56 + 24 + insets.bottom,
          gap: 14,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Press onPress={() => leave()} darken={false} hitSlop={12} style={{ width: 64 }}>
            <Txt variant="body" color={palette.body} style={{ fontSize: 16 }}>
              {t('plans.plant.cancel')}
            </Txt>
          </Press>
          <Txt
            variant="rowTitle"
            accessibilityRole="header"
            style={{ fontSize: 16 }}
          >
            {t('plans.plant.title')}
          </Txt>
          <View style={{ width: 64 }} />
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <SeedArt stage={stage} size={96} tile={look.seedTile} radius={24} />
          <View style={{ flex: 1, gap: 4 }}>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder={t('plans.plant.namePlaceholder')}
              placeholderTextColor={palette.placeholder}
              selectionColor={palette.go.bg}
              accessibilityLabel={t('plans.plant.namePlaceholder')}
              multiline
              maxLength={80}
              testID="plans-title"
              style={[
                titleFont,
                { fontSize: 25, lineHeight: 27.5, color: palette.text, padding: 0 },
              ]}
            />
            {author ? (
              <Txt variant="caption" color={palette.secondary} style={{ fontSize: 13, lineHeight: 17 }}>
                {t('plans.plant.fromMessage', { name: author })}
              </Txt>
            ) : null}
            <Txt variant="handL" color={look.hand} style={{ fontSize: 17, marginTop: 2 }}>
              {t(STAGE_CAPTIONS[stage])}
            </Txt>
          </View>
        </View>

        {fromSeq === null && farms.length > 1 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            <Txt variant="caption" color={palette.secondary}>
              {t('plans.plant.farm')}
            </Txt>
            {farms.map((f) => (
              <Chip
                key={f.farm}
                label={f.name ?? '…'}
                kind={f.farm === farm ? 'selected' : 'default'}
                onPress={() => onFarm(f.farm)}
              />
            ))}
          </View>
        ) : null}

        <Txt variant="body" multiline color={palette.body} style={{ fontSize: 14, lineHeight: 19.6 }}>
          {t('plans.plant.lead')}
        </Txt>

        <ConditionCard title={t('plans.day.title')} met={days.length > 0}>
          {today ? <DayChoices today={today} days={days} onChange={setDays} /> : null}
        </ConditionCard>
        <ConditionCard title={t('plans.place.title')} met={place.trim() !== ''}>
          <PlaceChoice value={place} onChange={setPlace} suggestions={suggestions} />
        </ConditionCard>
        <ConditionCard title={t('plans.yeses.title')} met={stage === 3}>
          <YesesChoice value={yeses} onChange={setYeses} inSoFar={you ? [you] : []} />
        </ConditionCard>
        <Button
          label={t('plans.plant.someday')}
          kind="text"
          disabled={busy || !canPlant(draft)}
          onPress={() => void plant(true)}
        />
      </ScrollView>
      <View style={{ position: 'absolute', left: 24, right: 24, bottom: 34 }}>
        <Button
          label={t('plans.plant.action')}
          kind="go"
          disabled={busy || !canPlant(draft) || !state}
          onPress={() => void plant(false)}
        />
      </View>
    </View>
  );
}
