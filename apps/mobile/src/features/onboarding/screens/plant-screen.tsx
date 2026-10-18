import { LIMITS } from '@kithfield/contracts';
import * as Clipboard from 'expo-clipboard';
import { getCalendars, getLocales } from 'expo-localization';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Share, useWindowDimensions, View } from 'react-native';

import { Avatar } from '../../../ui/art/avatar';
import { Button } from '../../../ui/components/button';
import { TextField } from '../../../ui/components/text-field';
import { useToast } from '../../../ui/components/toast';
import { useLocale } from '../../../ui/locale/locale-provider';
import { useTheme } from '../../../ui/theme/theme-provider';
import { Txt } from '../../../ui/type/text';
import { hemisphereOf } from '../calendar';
import { critterOf, lookOf } from '../critters';
import { routes } from '../flow';
import { plantFirstFarm } from '../move-in';
import { useProgress } from '../progress';
import { useFlow } from '../flow-state';
import { SceneArt } from '../scene-art';
import {
  Body,
  BottomBar,
  ErrorLine,
  StepDots,
  Title,
  TopBar,
  useDesignTop,
  useSceneAttrs,
} from '../kit';

/** The land a first farm is planted on. */
const FIRST_LAND = 'meadow';

/** A link as the card shows it, without its scheme. */
export const shownLink = (url: string) => url.replace(/^https?:\/\//, '');

/** What an invite says when it is shared, or null before the farm is planted. */
export function useFarmMessage(): string | null {
  const { t } = useLocale();
  const { state } = useFlow();
  if (!state.planted) return null;
  const name = state.name || state.suggestedName || '';
  return `${t('onboarding.farm.message', { name })}\n${state.planted.invite.url}`;
}

/**
 * Save a spot for your people: name the farm, and the first invite is made with it. Copying or
 * sharing the link plants the farm (once) and moves on to finding friends.
 */
export function PlantScreen() {
  const router = useRouter();
  const { t } = useLocale();
  const { palette } = useTheme();
  const { width } = useWindowDimensions();
  const top = useDesignTop();
  const scene = useSceneAttrs();
  const toast = useToast();
  const progress = useProgress();
  const { state, update } = useFlow();
  const [farmName, setFarmName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = state.name || state.suggestedName || '';

  /** The farm, planted now if it isn't yet. */
  const planted = async () => {
    if (state.planted) return state.planted;
    if (!progress.person) throw new Error('No person to plant for');
    // Planting, then becoming the critter chosen on this phone: only now is the way in done.
    const farm = await plantFirstFarm(
      progress.person,
      {
        name: farmName.trim(),
        land: FIRST_LAND,
        timeZone: getCalendars()[0]?.timeZone ?? 'UTC',
        hemisphere: hemisphereOf(getLocales()[0]?.regionCode),
      },
      progress.moveInDeps,
    );
    update({ planted: farm });
    return farm;
  };

  const act = async (how: 'copy' | 'share') => {
    if (busy) return;
    if (!state.planted && farmName.trim() === '') {
      setError(t('onboarding.farm.needName'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const farm = await planted();
      const message = `${t('onboarding.farm.message', { name })}\n${farm.invite.url}`;
      if (how === 'copy') {
        await Clipboard.setStringAsync(farm.invite.url);
        toast.show(t('onboarding.farm.copied'), 'check');
      } else {
        await Share.share({ message });
      }
      router.push(routes.contacts);
    } catch {
      setError(t('onboarding.failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <TopBar
        onBack={() => router.back()}
        inset={20}
        designTop={62}
        center={<StepDots step={3} />}
      />
      <View style={{ position: 'absolute', top: top(124), left: 28, right: 28, gap: 8 }}>
        <Title>{t('onboarding.farm.title')}</Title>
        <Body>{t('onboarding.farm.body')}</Body>
      </View>
      <SceneArt
        scene="invite"
        width={width}
        height={244}
        attrs={scene}
        style={{ position: 'absolute', top: top(240), left: 0 }}
      />
      <View style={{ position: 'absolute', top: top(496), left: 24, right: 24, gap: 12 }}>
        <TextField
          label={t('onboarding.farm.name')}
          value={farmName}
          placeholder={t('onboarding.farm.placeholder')}
          onChangeText={setFarmName}
          maxLength={LIMITS.farmName}
          editable={!state.planted}
          returnKeyType="done"
        />
        <View
          style={{
            borderRadius: 22,
            backgroundColor: palette.card,
            borderWidth: 1,
            borderColor: palette.cardBorder,
            padding: 14,
            flexDirection: 'row',
            gap: 12,
            alignItems: 'flex-start',
          }}
        >
          <Avatar kind={state.choice.species} look={lookOf(critterOf(state.choice))} size={40} />
          <View style={{ flex: 1, gap: 6, minWidth: 0 }}>
            <Txt variant="handL" multiline style={{ fontSize: 19, lineHeight: 21.85 }}>
              {t('onboarding.farm.message', { name })}
            </Txt>
            <Txt variant="code" mono color={palette.secondary} numberOfLines={1}>
              {state.planted ? shownLink(state.planted.invite.url) : t('onboarding.farm.linkSoon')}
            </Txt>
          </View>
        </View>
        <ErrorLine text={error} />
      </View>
      <BottomBar gap={10}>
        <Txt
          variant="caption"
          multiline
          align="center"
          color={palette.secondary}
          style={{ fontSize: 13, lineHeight: 18.2, marginBottom: 4 }}
        >
          {t('onboarding.farm.note')}
        </Txt>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button
            label={t('onboarding.farm.copy')}
            kind="secondary"
            onPress={() => void act('copy')}
            disabled={busy}
            style={{ flex: 1 }}
          />
          <Button
            label={t('onboarding.farm.share')}
            onPress={() => void act('share')}
            disabled={busy}
            style={{ flex: 1.4 }}
          />
        </View>
      </BottomBar>
    </View>
  );
}
