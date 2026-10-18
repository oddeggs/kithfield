import type { FarmId } from '@kithfield/contracts';
import type { FarmView } from '@kithfield/farm';
import { router } from 'expo-router';
import { useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useFarm, useFarmEvents, useFarmView, useOpenFarm, useSend } from '../../data';
import { LayeredScene } from '../../ui/art/layered-scene';
import { useToast } from '../../ui/components/toast';
import { useLocale } from '../../ui/locale/locale-provider';
import { haptics } from '../../ui/motion/haptics';
import { Press } from '../../ui/motion/press';
import { useSession } from '../../ui/session/session';
import { useTheme } from '../../ui/theme/theme-provider';
import { Txt } from '../../ui/type/text';
import { nameOf } from '../farm/farm-copy';
import { NightVeil, Panel } from '../farm/panel';
import { useNow } from '../farm/use-now';
import { ActionButton, Faces, TitlePill } from './chrome';
import { rainNames } from './copy';
import { sharedRainToday } from './moments';
import { rhythmRoutes } from './routes';

const W = 393;

/**
 * Shared rain: three or more of you on the farm within ten minutes. The farm writes it, and it
 * grows a Gatherings tend for each person under it (`docs/farm-model.md` §6); this screen is the
 * moment it shows, and anything sent from here is ordinary care.
 */
export function RainScreen({ farm }: { readonly farm: FarmId }) {
  const { t } = useLocale();
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const k = width / W;
  const now = useNow();
  useOpenFarm(farm);
  const state = useFarm(farm)?.state ?? null;
  const view = useFarmView<FarmView>(farm, now);
  const events = useFarmEvents(farm, 100);
  const me = useSession().person?.id ?? null;
  const send = useSend(farm);
  const toast = useToast();
  const [waved, setWaved] = useState(false);

  const people = (view && sharedRainToday(events, view.today)) ?? [];
  const others = people.filter((p) => p !== me);
  const withMe = me !== null && people.includes(me);
  const names = rainNames(
    t,
    others.map((p) => nameOf(t, state, p)),
    withMe,
  );
  const critters = people.flatMap((p) => {
    const m = state?.members.find((x) => x.person === p);
    return m ? [m.critter] : [];
  });
  const close = () => router.back();
  const sayHi = async () => {
    haptics.soft();
    const sent = await send('wave', {});
    if (sent.status === 'queued') {
      setWaved(true);
      toast.show(t('rhythm.rain.hiSent'), 'wave');
      close();
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <Press
        onPress={close}
        darken={false}
        accessibilityRole="button"
        accessibilityLabel={t('rhythm.backToFarm')}
        style={{ position: 'absolute', top: 0, left: 0 }}
      >
        <LayeredScene
          scene="farm"
          width={width}
          height={540 * k}
          attrs={{ season: state?.season.season ?? 'spring', rain: true }}
          tolerance={8}
        />
        <NightVeil width={width} height={540 * k} />
      </Press>
      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          top: insets.top + 1,
          left: 16,
          right: 16,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <TitlePill title={t('rhythm.rain.pill')} icon="raincloud" />
        <Faces critters={critters.slice(0, 6)} size={28} ring={palette.panel} />
      </View>
      <Panel top={500 * k} style={{ paddingHorizontal: 20 }}>
        <Txt variant="displayM" multiline accessibilityRole="header">
          {t('rhythm.rain.title')}
        </Txt>
        <Txt variant="sheetBody" multiline color={palette.body}>
          {withMe ? t('rhythm.rain.body', { names }) : t('rhythm.rain.bodyAll', { names })}
        </Txt>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <ActionButton
            label={t('rhythm.rain.voice')}
            icon="mic"
            onPress={() => toast.show(t('farm.fire.soon'), 'lantern')}
            bg={palette.fillSecondary}
            fg={palette.text}
            small
            style={{ flex: 1, height: 48 }}
          />
          <ActionButton
            label={t('rhythm.rain.photo')}
            icon="camera"
            onPress={() => {
              close();
              router.push(rhythmRoutes.attach(farm));
            }}
            bg={palette.fillSecondary}
            fg={palette.text}
            small
            style={{ flex: 1, height: 48 }}
          />
        </View>
      </Panel>
      <View style={{ position: 'absolute', left: 24, right: 24, bottom: 34 }}>
        <ActionButton
          label={waved ? t('rhythm.rain.hiSent') : t('rhythm.rain.hi')}
          onPress={() => void sayHi()}
          bg={palette.primary.bg}
          fg={palette.primary.fg}
          disabled={waved}
        />
      </View>
    </View>
  );
}
