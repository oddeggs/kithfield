import type { FarmId, PersonId } from '@kithfield/contracts';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { openBrowserAsync } from 'expo-web-browser';
import { useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useFarm, useSend } from '../../data';
import { ArtStill } from '../../ui/art/art-view';
import { Avatar } from '../../ui/art/avatar';
import { Button } from '../../ui/components/button';
import { useToast } from '../../ui/components/toast';
import { useLocale } from '../../ui/locale/locale-provider';
import { useSession } from '../../ui/session/session';
import { useTheme } from '../../ui/theme/theme-provider';
import { Txt } from '../../ui/type/text';
import { monthOf } from './critter-card';
import { lookOf } from './farm-bake';
import { overArt, withAlpha } from './over-art';
import { GlyphButton, Panel, SceneArt } from './panel';
import { backToFarm, farmRoutes } from './routes';
import { useValley } from './valley-store';

const W = 393;

/**
 * Leaving a farm quietly: the cottage dozes with a "gone wandering" sign and nobody is
 * told. It writes `left`, and the Farm tab moves to another farm you live on.
 */
export function LeaveFarm({ farm }: { readonly farm: FarmId }) {
  const { t } = useLocale();
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const k = width / W;
  const toast = useToast();
  const state = useFarm(farm)?.state ?? null;
  const valley = useValley();
  const send = useSend(farm);
  const [busy, setBusy] = useState(false);
  const me = useSession().person?.id ?? null;
  const leave = async () => {
    if (busy) return;
    setBusy(true);
    const result = await send('left', {});
    setBusy(false);
    if (result.status === 'refused') {
      toast.show(t('farm.leave.failed'));
      return;
    }
    await valley.left(farm);
    backToFarm();
  };
  const species = state?.members.find((m) => m.person === me)?.critter.species ?? 'rabbit';
  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <SceneArt
        scene="leftcot"
        width={width}
        height={360 * k}
        attrs={{ kind: species, season: state?.season.season ?? 'spring' }}
      />
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: withAlpha(overArt.ink, 0.18),
        }}
      />
      <Panel top={300 * k}>
        <Txt variant="errorTitle" multiline accessibilityRole="header">
          {t('farm.leave.title', { name: state?.name ?? '' })}
        </Txt>
        <Txt variant="sheetBody" multiline color={palette.body}>
          {t('farm.leave.body')}
        </Txt>
        <Txt variant="rowSubtitle" multiline color={palette.secondary}>
          {t('farm.leave.foot')}
        </Txt>
        <View style={{ marginTop: 'auto', marginBottom: Math.max(insets.bottom, 34), gap: 6 }}>
          <Button label={t('farm.leave.action')} disabled={busy} onPress={() => void leave()} />
          <Button label={t('farm.leave.stay')} kind="text" onPress={() => router.back()} />
        </View>
      </Panel>
    </View>
  );
}

/** The site's house rules, on the same host as the API (the Terms page). */
function rulesUrl(language: string): string {
  const base: unknown = Constants.expoConfig?.extra?.['apiBase'];
  const api = typeof base === 'string' ? base : '';
  const site = api.startsWith('https://') ? api.replace(/\/api\/?$/, '') : 'https://kithfield.com';
  return `${site}${language === 'vi' ? '/vi' : ''}/terms`;
}

/**
 * Taken off a farm, shown once: the farm's name, never who made the change, and the way
 * on to the farms that are still yours.
 */
export function RemovedFromFarm({ farm }: { readonly farm: FarmId }) {
  const { t, language } = useLocale();
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const k = width / W;
  const state = useFarm(farm)?.state ?? null;
  const name = state?.name ?? null;
  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <View style={{ position: 'absolute', top: 110 * k, left: 0 }}>
        <ArtStill
          scene="spot"
          width={width}
          height={280 * k}
          attrs={{ name: 'removed', season: state?.season.season ?? 'spring' }}
        />
      </View>
      <View style={{ position: 'absolute', top: 410 * k, left: 28, right: 28, gap: 10 }}>
        <Txt variant="errorTitle" multiline align="center" accessibilityRole="header">
          {name ? t('farm.removed.title', { name }) : t('farm.removed.titleUnnamed')}
        </Txt>
        <Txt variant="sheetBody" multiline align="center" color={palette.body}>
          {t('farm.removed.body')}
        </Txt>
      </View>
      <View
        style={{
          position: 'absolute',
          left: 24,
          right: 24,
          bottom: Math.max(insets.bottom, 34),
          gap: 6,
        }}
      >
        <Button
          label={t('farm.removed.farms')}
          onPress={() => {
            router.back();
            router.navigate(farmRoutes.valley());
          }}
        />
        <Button
          label={t('farm.removed.rules')}
          kind="text"
          onPress={() => void openBrowserAsync(rulesUrl(language))}
        />
      </View>
    </View>
  );
}

/**
 * A cottage left behind: whoever went wandering, their lantern still lit. Their old
 * messages keep their name; a keeper can send them an invite back.
 */
export function SleepingCottage({
  farm,
  person,
}: {
  readonly farm: FarmId;
  readonly person: PersonId;
}) {
  const { t, language } = useLocale();
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const k = width / W;
  const state = useFarm(farm)?.state ?? null;
  const former = state?.former.find((f) => f.person === person) ?? null;
  if (!state || !former) return <View style={{ flex: 1, backgroundColor: palette.background }} />;
  const name = former.name ?? t('farm.someone');
  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <SceneArt
        scene="leftcot"
        width={width}
        height={470 * k}
        attrs={{ kind: former.critter.species, season: state.season.season }}
      />
      <GlyphButton
        glyph="‹"
        label={t('farm.back')}
        side="left"
        top={insets.top - 1}
        onPress={() => router.back()}
      />
      <Panel top={420 * k}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Avatar
            kind={former.critter.species}
            look={lookOf(former.critter)}
            state="sleep"
            size={48}
          />
          <View style={{ flex: 1 }}>
            <Txt variant="displayM" style={{ fontSize: 24 }} multiline accessibilityRole="header">
              {t('farm.cottage.title', { name })}
            </Txt>
            <Txt variant="rowSubtitle" color={palette.secondary} style={{ marginTop: 3 }}>
              {t('farm.cottage.since', {
                name,
                month: monthOf(language, former.leftAt, Date.now()),
              })}
            </Txt>
          </View>
        </View>
        <Txt variant="sheetBody" multiline color={palette.body}>
          {t('farm.cottage.body', { name })}
        </Txt>
        <Button
          label={t('farm.cottage.invite', { name })}
          kind="go"
          onPress={() => router.push(farmRoutes.farmSettings(farm))}
        />
        <Button
          label={t('farm.cottage.rest')}
          kind="secondary"
          size="medium"
          style={{ minHeight: 50 }}
          onPress={() => router.back()}
        />
      </Panel>
    </View>
  );
}
