import type { FarmList } from '@kithfield/contracts';
import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDataClient, useFarm, useFarmEvents, useOpenFarm } from '../../../data';
import { Chip } from '../../../ui/components/chip';
import { useLocale } from '../../../ui/locale/locale-provider';
import { useSession } from '../../../ui/session/session';
import { useTheme } from '../../../ui/theme/theme-provider';
import { Txt } from '../../../ui/type/text';
import { MENU_KINDS, shownText } from '../model/message';
import { friendsOf } from '../model/people';
import { routes } from '../routes';

function FarmTools({ farm }: { readonly farm: string }) {
  const { t } = useLocale();
  const { palette } = useTheme();
  const { person } = useSession();
  useOpenFarm(farm);
  const state = useFarm(farm)?.state ?? null;
  const events = useFarmEvents(farm, 60);
  const friends = friendsOf(state, person?.id ?? null);
  const [friend, setFriend] = useState<string | undefined>(undefined);
  const messages = events.filter((e) => MENU_KINDS.has(e.kind)).slice(-8);
  const [seq, setSeq] = useState<number | undefined>(undefined);
  const chosenSeq = seq ?? messages.at(-1)?.seq;
  const open = (href: Href) => router.push(href);
  return (
    <View style={{ gap: 12 }}>
      <Txt variant="label">{t('gestures.lab.friend')}</Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {friends.map((f) => (
          <Chip
            key={f.person}
            label={f.name ?? f.person}
            kind={friend === f.person ? 'selected' : 'default'}
            onPress={() => setFriend(friend === f.person ? undefined : f.person)}
          />
        ))}
      </View>
      <Txt variant="label">{t('gestures.lab.message')}</Txt>
      <View style={{ gap: 6 }}>
        {messages.map((e) => (
          <Chip
            key={e.seq}
            label={`${e.seq} · ${(shownText(e, events) ?? e.kind).slice(0, 30)}`}
            kind={chosenSeq === e.seq ? 'selected' : 'default'}
            onPress={() => setSeq(e.seq)}
          />
        ))}
      </View>
      <Txt variant="label">{t('gestures.lab.open')}</Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        <Chip
          label={t('gestures.lab.menu')}
          onPress={() =>
            chosenSeq &&
            open({
              pathname: '/(modal)/gestures-message',
              params: { farm, seq: String(chosenSeq), top: '380' },
            })
          }
        />
        <Chip
          label={t('gestures.lab.tray')}
          onPress={() =>
            open({
              pathname: '/(modal)/gestures-tray',
              params: friend ? { farm, to: friend } : { farm },
            })
          }
        />
        <Chip
          label={t('gestures.tray.firefly')}
          onPress={() => open(routes.firefly(farm, friend))}
        />
        <Chip label={t('gestures.quickTend.title')} onPress={() => open('/gestures-quick-tend')} />
        <Chip
          label={t('gestures.tray.slowPost')}
          onPress={() => open(routes.slowPost(farm, friend))}
        />
        <Chip label={t('gestures.tray.knock')} onPress={() => open(routes.knock(farm, friend))} />
        <Chip
          label={t('gestures.lab.weather')}
          onPress={() => friend && open(routes.weather(farm, friend))}
        />
        <Chip
          label={t('gestures.forward.title')}
          onPress={() => chosenSeq && open(routes.forward(farm, chosenSeq))}
        />
        <Chip label={t('gestures.files.attach')} onPress={() => open(routes.attach(farm))} />
        <Chip
          label={t('gestures.reactions.title')}
          onPress={() => chosenSeq && open(routes.reactions(farm, chosenSeq))}
        />
      </View>
      <Txt variant="caption" color={palette.muted}>
        {state ? `${state.name ?? state.kind} · ${state.members.length}` : '…'}
      </Txt>
    </View>
  );
}

/**
 * Development only: opens each gesture screen with real parameters on a farm this person lives
 * on, against the local API.
 */
export function GesturesLab() {
  const { t } = useLocale();
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const client = useDataClient();
  const [farms, setFarms] = useState<FarmList['farms'] | null>(null);
  const [farm, setFarm] = useState<string | null>(null);
  useEffect(() => {
    client.api.farms().then(
      (list) => setFarms(list.farms),
      () => setFarms([]),
    );
  }, [client]);
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.background }}
      contentContainerStyle={{
        paddingTop: insets.top + 12,
        paddingBottom: insets.bottom + 40,
        paddingHorizontal: 16,
        gap: 16,
      }}
    >
      <Txt variant="displayM" accessibilityRole="header">
        {t('gestures.lab.title')}
      </Txt>
      <Txt variant="caption" multiline color={palette.muted}>
        {t('gestures.lab.subtitle')}
      </Txt>
      <Txt variant="label">{t('gestures.lab.farm')}</Txt>
      {farms !== null && farms.length === 0 ? (
        <Txt variant="caption">{t('gestures.lab.noFarm')}</Txt>
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {(farms ?? []).map((f) => (
          <Chip
            key={f.farm}
            label={f.name ?? f.with?.name ?? f.farm}
            kind={farm === f.farm ? 'selected' : 'default'}
            onPress={() => setFarm(f.farm)}
          />
        ))}
      </View>
      {farm ? <FarmTools key={farm} farm={farm} /> : null}
    </ScrollView>
  );
}
