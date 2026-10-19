import type { ChatListItem, Critter, PersonId } from '@kithfield/contracts';
import { day } from '@kithfield/theme';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, View } from 'react-native';

import { useCottage } from '../../data';
import { useRowFacts, useRowLine } from '../../features/chat/list/row-data';
import { hasNews, sectionsOf } from '../../features/chat/model/chat-list';
import { lookOf } from '../../features/chat/model/people';
import { useBlockedIds } from '../../features/chat/ui/blocked';
import { useSeenTo } from '../../features/chat/ui/seen-store';
import { useMe } from '../../features/chat/ui/use-me';
import { ArtIcon, ArtStill } from '../../ui/art/art-view';
import { Avatar } from '../../ui/art/avatar';
import { useLocale } from '../../ui/locale/locale-provider';
import { Press } from '../../ui/motion/press';
import { useTheme } from '../../ui/theme/theme-provider';
import { Txt } from '../../ui/type/text';
import { platformLook } from '../look';
import { openChat } from './desk-shell';
import { KeyCap } from './key-cap';
import { useNowMinute } from './use-now-minute';

const THUMB = 40;

/** A visit shows both critters, theirs above and yours below, as the design overlaps them. */
function VisitThumb({ peer, mine }: { readonly peer: Critter; readonly mine: Critter | null }) {
  const { palette } = useTheme();
  return (
    <View style={{ width: THUMB, height: THUMB }}>
      <Avatar
        kind={peer.species}
        look={lookOf(peer)}
        size={28}
        ring={palette.sheet}
        style={{ position: 'absolute', left: 0, top: 0 }}
      />
      {mine ? (
        <Avatar
          kind={mine.species}
          look={lookOf(mine)}
          size={28}
          ring={palette.sheet}
          style={{ position: 'absolute', right: 0, bottom: 0 }}
        />
      ) : null}
    </View>
  );
}

function DeskRow({
  row,
  me,
  myCritter,
  now,
  selected,
}: {
  readonly row: ChatListItem;
  readonly me: PersonId | null;
  readonly myCritter: Critter | null;
  readonly now: number;
  readonly selected: boolean;
}) {
  const { t } = useLocale();
  const { palette } = useTheme();
  const facts = useRowFacts(row.farm, now);
  const line = useRowLine(row, facts, me);
  const news = hasNews(row, me, useSeenTo(row.farm)) && !row.muted;
  const title =
    row.farmKind === 'visit' ? (row.with?.name ?? t('chat.friendWhoLeft')) : (row.name ?? '');
  return (
    <Press
      onPress={() => openChat(row.farm)}
      darken={false}
      radius={14}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={[title, line, news ? t('chat.list.somethingNew') : '']
        .filter(Boolean)
        .join(', ')}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderRadius: 14,
        backgroundColor: selected ? palette.fillSoft : 'transparent',
      }}
    >
      {row.farmKind === 'visit' && row.with ? (
        <VisitThumb peer={row.with.critter} mine={myCritter} />
      ) : (
        <View style={{ width: THUMB, height: THUMB, borderRadius: 12, overflow: 'hidden' }}>
          <ArtStill scene="strip" width={THUMB} height={THUMB} attrs={{ season: facts.season }} />
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="rowTitle" numberOfLines={1} style={{ fontSize: 14, lineHeight: 16.8 }}>
          {title}
        </Txt>
        <Txt
          variant="caption"
          color={palette.secondary}
          numberOfLines={1}
          style={{ fontSize: 12.5, lineHeight: 16.25 }}
        >
          {line}
        </Txt>
      </View>
      {news ? (
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: day.honey }} />
      ) : null}
    </Press>
  );
}

function Section({ label }: { readonly label: string }) {
  const { palette } = useTheme();
  return (
    <Txt
      variant="label"
      color={palette.secondary}
      style={{
        fontSize: 11,
        lineHeight: 11,
        letterSpacing: 0.66,
        paddingTop: 10,
        paddingBottom: 4,
        paddingHorizontal: 10,
      }}
    >
      {label}
    </Txt>
  );
}

/**
 * The left pane: search (⌘K), the farms, the visits, and you at the foot with your settings. A
 * farm with something new carries the honey dot; the chosen one is shaded.
 */
export function DeskList({ farm }: { readonly farm: string | null }) {
  const { t } = useLocale();
  const { palette } = useTheme();
  const { chats } = useCottage();
  const blocked = useBlockedIds();
  const me = useMe();
  const now = useNowMinute();
  const { farms, visits } = useMemo(() => sectionsOf(chats, blocked), [chats, blocked]);

  const rows = (list: readonly ChatListItem[]) =>
    list.map((row) => (
      <DeskRow
        key={row.farm}
        row={row}
        me={me.person}
        myCritter={me.critter}
        now={now}
        selected={row.farm === farm}
      />
    ));

  return (
    <View
      style={{
        width: platformLook.listWidth,
        backgroundColor: palette.sheet,
        borderRightWidth: 1,
        borderColor: palette.hairline,
        paddingVertical: 12,
        paddingHorizontal: 10,
      }}
    >
      <View style={{ paddingTop: 2, paddingHorizontal: 6, paddingBottom: 8 }}>
        <Press
          onPress={() =>
            router.push({ pathname: '/(cover)/chat-search', params: farm ? { farm } : {} })
          }
          radius={10}
          accessibilityRole="search"
          accessibilityLabel={t('platforms.desk.search')}
          style={{
            height: 32,
            borderRadius: 10,
            backgroundColor: palette.card,
            borderWidth: 1,
            borderColor: palette.cardBorder,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingHorizontal: 10,
          }}
        >
          <ArtIcon name="search" size={15} color={palette.placeholder} />
          <Txt variant="caption" color={palette.placeholder} style={{ flex: 1, fontSize: 13 }}>
            {t('platforms.desk.search')}
          </Txt>
          <KeyCap keys="⌘K" />
        </Press>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 2 }}>
        {farms.length > 0 ? <Section label={t('platforms.desk.farms')} /> : null}
        {rows(farms)}
        {visits.length > 0 ? <Section label={t('platforms.desk.visits')} /> : null}
        {rows(visits)}
      </ScrollView>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10 }}>
        {me.critter ? (
          <Avatar kind={me.critter.species} look={lookOf(me.critter)} size={32} />
        ) : null}
        <View style={{ flex: 1 }}>
          <Txt variant="rowTitle" style={{ fontSize: 13.5, lineHeight: 16.2 }}>
            {me.name ?? ''}
          </Txt>
          <Txt
            variant="caption"
            color={palette.secondary}
            style={{ fontSize: 12, lineHeight: 14.4 }}
          >
            {t('platforms.desk.lampOn')}
          </Txt>
        </View>
        <Press
          onPress={() => router.navigate('/(tabs)/you')}
          radius={14}
          accessibilityLabel={t('platforms.desk.settings')}
          style={{ padding: 4 }}
        >
          <ArtIcon name="gear" size={20} color={palette.secondary} />
        </Press>
      </View>
    </View>
  );
}
