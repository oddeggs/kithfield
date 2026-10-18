import type { Crop, FarmId, FarmState, PersonId } from '@kithfield/contracts';
import { motion } from '@kithfield/theme';
import type { Language, Translate } from '@kithfield/i18n';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, ReduceMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useFarm, useSend, type EnqueueResult } from '../../data';
import { ArtStill } from '../../ui/art/art-view';
import { Button } from '../../ui/components/button';
import { useToast } from '../../ui/components/toast';
import { useLocale } from '../../ui/locale/locale-provider';
import { useSession } from '../../ui/session/session';
import { useTheme } from '../../ui/theme/theme-provider';
import { Txt } from '../../ui/type/text';
import { listOf, say } from '../farm/farm-copy';
import { typeAt } from '../farm/type-at';
import { cropName, familyName } from './guide-copy';
import { guideMotion, useGuideLook } from './guide-look';
import { entryOf } from './guide-model';
import { seasonKey } from './moments';
import { harvestNote } from './page-copy';
import { HeroSheet, PlantTile, RoundButton } from './parts';
import { useMarkHarvestSeen } from './use-moments';

const W = 393;

/** A crop's line under its name: its family, its rare variant, or the farm's own. */
function cropLine(t: Translate, state: FarmState, crop: Crop): string {
  const entry = entryOf(crop.plant);
  const base = entry?.family
    ? familyName(t, entry.family)
    : crop.plant === state.signature || entry?.role === 'signature'
      ? t('fieldGuide.harvest.signature')
      : '';
  if (!crop.variant) return base;
  return t('fieldGuide.harvest.rare', {
    family: base,
    variant: say(t, `fieldGuide.variantWord.${crop.variant}`),
  });
}

/** The basket as a message to the farm: "Look what we grew this autumn: pumpkins and heather." */
function basketMessage(t: Translate, language: Language, state: FarmState, crops: readonly Crop[]) {
  const season = state.basket?.season.season ?? state.season.season;
  const names = crops.map((c) => {
    const name = cropName(t, language, state, c);
    return c.plant === state.signature ? name : name.charAt(0).toLocaleLowerCase() + name.slice(1);
  });
  return t('fieldGuide.harvest.message', {
    season: say(t, `fieldGuide.seasonWord.${season}`),
    crops: listOf(t, names),
  });
}

/**
 * Harvest day: the basket, and what everyone grew together filling it one crop at a time, with
 * the quiet friends' care named and nothing ranked. Sharing posts the basket to the farm's chat.
 */
export function HarvestScreen({ farm }: { readonly farm: FarmId }) {
  const me = useSession().person?.id ?? null;
  const state = useFarm(farm)?.state ?? null;
  const send = useSend(farm);
  const markSeen = useMarkHarvestSeen(farm);
  const basket = state?.kind === 'farm' ? state.basket : null;
  const marked = useRef(false);
  useEffect(() => {
    if (!basket || marked.current) return;
    marked.current = true;
    void markSeen(seasonKey(basket.season));
  }, [basket, markSeen]);
  return <HarvestPage state={state} me={me} post={(text) => send('message', { text })} />;
}

/** Harvest day drawn from a farm; `post` sends the basket to the farm's chat. */
export function HarvestPage({
  state,
  me,
  post,
}: {
  readonly state: FarmState | null;
  readonly me: PersonId | null;
  readonly post: (text: string) => Promise<EnqueueResult>;
}) {
  const { t, language, fontLocale } = useLocale();
  const { palette } = useTheme();
  const look = useGuideLook();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const k = width / W;
  const toast = useToast();
  const [sending, setSending] = useState(false);
  const basket = state?.kind === 'farm' ? state.basket : null;

  const close = (
    <View style={{ position: 'absolute', top: insets.top - 1, left: 16 }}>
      <RoundButton label={t('fieldGuide.close')} onPress={() => router.back()} />
    </View>
  );
  if (!state || !basket) {
    return <View style={{ flex: 1, backgroundColor: palette.background }}>{close}</View>;
  }

  const crops = basket.crops;
  const share = async () => {
    if (sending) return;
    setSending(true);
    const result = await post(basketMessage(t, language, state, crops));
    setSending(false);
    if (result.status === 'queued') {
      toast.show(t('fieldGuide.harvest.shared'));
      router.back();
    } else {
      toast.show(t('fieldGuide.harvest.notSent'));
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <ArtStill
        scene="harvest"
        width={width}
        height={300 * k}
        attrs={{ season: basket.season.season }}
        style={{ position: 'absolute', left: 0, top: 40 * k }}
      />
      {close}
      <HeroSheet top={330 * k}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: 12,
            gap: 12,
            paddingBottom: insets.bottom + 12,
          }}
        >
          <View style={{ gap: 4 }}>
            <Txt variant="handL" color={look.found} style={typeAt('handL', 17, 18.7, fontLocale)}>
              {t('fieldGuide.harvest.eyebrow', {
                season: say(t, `fieldGuide.seasonWord.${basket.season.season}`),
              })}
            </Txt>
            <Txt
              variant="displayM"
              multiline
              accessibilityRole="header"
              style={typeAt('displayM', 28, 31.4, fontLocale)}
            >
              {t('fieldGuide.harvest.title')}
            </Txt>
          </View>
          {crops.length === 0 ? (
            <Txt variant="body" multiline color={palette.body}>
              {t('fieldGuide.harvest.empty')}
            </Txt>
          ) : (
            <View>
              {crops.map((crop, i) => (
                <Animated.View
                  key={`${crop.plant}-${crop.variant ?? ''}`}
                  entering={FadeIn.duration(motion.fade.durationMs)
                    .delay(i * guideMotion.basketStepMs)
                    .reduceMotion(ReduceMotion.Never)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    paddingVertical: 8,
                    borderBottomWidth: i === crops.length - 1 ? 0 : 1,
                    borderBottomColor: palette.hairline,
                  }}
                >
                  <PlantTile
                    art={{ plant: crop.plant, stage: 4, color: look.page }}
                    width={52}
                    radius={12}
                  />
                  <View style={{ flex: 1 }}>
                    <Txt
                      variant="rowTitle"
                      numberOfLines={1}
                      style={typeAt('rowTitle', 15.5, 18.6, fontLocale)}
                    >
                      {cropName(t, language, state, crop)}
                    </Txt>
                    <Txt
                      variant="caption"
                      numberOfLines={1}
                      color={palette.secondary}
                      style={typeAt('caption', 13, 16.9, fontLocale)}
                    >
                      {cropLine(t, state, crop)}
                    </Txt>
                  </View>
                </Animated.View>
              ))}
            </View>
          )}
          <View
            style={{
              paddingVertical: 10,
              paddingHorizontal: 12,
              borderRadius: 16,
              backgroundColor: look.note.bg,
            }}
          >
            <Txt
              variant="caption"
              multiline
              color={look.note.fg}
              style={typeAt('caption', 13.5, 19.6, fontLocale)}
            >
              {harvestNote(t, state, crops, me)}
            </Txt>
          </View>
          {crops.length > 0 ? (
            <Button
              kind="go"
              label={t('fieldGuide.harvest.share')}
              disabled={sending}
              onPress={() => void share()}
            />
          ) : null}
        </ScrollView>
      </HeroSheet>
    </View>
  );
}
