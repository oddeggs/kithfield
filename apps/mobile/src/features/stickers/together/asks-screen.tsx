import type { MemberState, TogetherAskList } from '@kithfield/contracts';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDataClient } from '../../../data';
import { ArtStill } from '../../../ui/art/art-view';
import { Avatar } from '../../../ui/art/avatar';
import { lookOf } from '../../../ui/art/critter-look';
import { Chip } from '../../../ui/components/chip';
import { EmptyState, ErrorState } from '../../../ui/components/state-shell';
import { useLocale } from '../../../ui/locale/locale-provider';
import { useTheme } from '../../../ui/theme/theme-provider';
import { Txt } from '../../../ui/type/text';
import { stickersApi } from '../api';

type Ask = TogetherAskList['asks'][number];

/**
 * Friends asking to take together stickers with you in them out of Kithfield. Each asks once; you
 * can change your answer any time. They only ever learn who said OK.
 */
export function AsksScreen() {
  const { t } = useLocale();
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const client = useDataClient();
  const [asks, setAsks] = useState<readonly Ask[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [people, setPeople] = useState<Record<string, MemberState>>({});

  const load = useCallback(() => {
    setFailed(false);
    stickersApi(client.api)
      .asks()
      .then(
        (r) => setAsks(r.asks),
        () => setFailed(true),
      );
  }, [client]);
  useEffect(load, [load]);

  // Who asked, as the farm they asked from knows them.
  useEffect(() => {
    if (asks === null) return;
    void Promise.all(
      [...new Set(asks.map((a) => a.farm))].map(
        async (f) => (await client.replica(f)).getState().state,
      ),
    ).then((states) => {
      const found: Record<string, MemberState> = {};
      for (const s of states) for (const m of s?.members ?? []) found[m.person] = m;
      setPeople(found);
    });
  }, [asks, client]);

  const answer = (ask: Ask, ok: boolean) => {
    setAsks((list) => list?.map((a) => (a.from === ask.from ? { ...a, ok } : a)) ?? null);
    stickersApi(client.api)
      .answerAsk(ask.from, { ok })
      .catch(() => load());
  };

  if (failed) {
    return (
      <ErrorState
        art={<ArtStill scene="spot" width={300} height={216} attrs={{ name: 'offline' }} />}
        title={t('stickers.asks.title')}
        body={t('stickers.adding.failed')}
        action={{ label: t('stickers.tryAgain'), onPress: load, kind: 'primary' }}
      />
    );
  }
  if (asks !== null && asks.length === 0) {
    return (
      <EmptyState
        art={<ArtStill scene="spot" width={300} height={216} attrs={{ name: 'empty' }} />}
        title={t('stickers.asks.title')}
        body={t('stickers.asks.empty')}
      />
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.background }}
      contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24, gap: 12 }}
    >
      <Txt variant="sheetTitle" accessibilityRole="header">
        {t('stickers.asks.title')}
      </Txt>
      <Txt variant="sheetBody" multiline color={palette.body}>
        {t('stickers.asks.lead')}
      </Txt>
      {(asks ?? []).map((ask) => {
        const who = people[ask.from];
        const name = who?.name ?? t('stickers.someone');
        return (
          <View
            key={ask.from}
            style={{
              borderRadius: 22,
              backgroundColor: palette.card,
              borderWidth: 1,
              borderColor: palette.cardBorder,
              padding: 14,
              gap: 10,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              {who ? (
                <Avatar kind={who.critter.species} look={lookOf(who.critter)} size={36} />
              ) : null}
              <Txt variant="rowTitle" style={{ flex: 1 }}>
                {t('stickers.asks.from', { name })}
              </Txt>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }} accessibilityLiveRegion="polite">
              <Chip
                label={ask.ok === true ? t('stickers.asks.answeredYes') : t('stickers.asks.yes')}
                kind={ask.ok === true ? 'selected' : 'default'}
                onPress={() => answer(ask, true)}
              />
              <Chip
                label={ask.ok === false ? t('stickers.asks.answeredNo') : t('stickers.asks.no')}
                kind={ask.ok === false ? 'selected' : 'default'}
                onPress={() => answer(ask, false)}
              />
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}
