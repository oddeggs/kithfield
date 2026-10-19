import type { ChatListItem, Critter, PersonId } from '@kithfield/contracts';
import { screens } from '@kithfield/theme';
import { router, useSegments } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCottage, useDataClient } from '../../../data';
import { ArtIcon, ArtStill } from '../../../ui/art/art-view';
import { Avatar } from '../../../ui/art/avatar';
import { setOpenChat, useOpenChat } from '../../../ui/layout/open-chat';
import { useWindowed } from '../../../ui/layout/pane';
import { useLocale } from '../../../ui/locale/locale-provider';
import { Press } from '../../../ui/motion/press';
import { useTabDot } from '../../../ui/tab-bar/tab-activity';
import { useTheme } from '../../../ui/theme/theme-provider';
import { Txt } from '../../../ui/type/text';
// Choosing a farm here shows it in the live farm beside the chat, and on the Farm tab.
import { useValley } from '../../farm/valley-store';
import { hasNews, sectionsOf } from '../model/chat-list';
import { lookOf } from '../model/people';
import { go } from '../routes';
import { useBlockedIds } from '../ui/blocked';
import { useSeenTo } from '../ui/seen-store';
import { useMe } from '../ui/use-me';
import { useRowFacts, useRowLine } from './row-data';

const type = screens.sidebarType;
const ROW = screens.sidebarRow;

/** The chat shown beside the sidebar: the one chosen, else the farm you're on, else the newest. */
export function useShownChat(): string | null {
  const open = useOpenChat();
  const valley = useValley();
  const { chats } = useCottage();
  const blocked = useBlockedIds();
  const { farms, visits } = useMemo(() => sectionsOf(chats, blocked), [chats, blocked]);
  const listed = (farm: string | null) =>
    farm !== null && (farms.some((r) => r.farm === farm) || visits.some((r) => r.farm === farm));
  return (
    [open, valley.current, farms[0]?.farm ?? null, visits[0]?.farm ?? null].find(listed) ?? null
  );
}

function SidebarRow({
  row,
  me,
  myCritter,
  now,
  selected,
  onPress,
}: {
  readonly row: ChatListItem;
  readonly me: PersonId | null;
  readonly myCritter: Critter | null;
  readonly now: number;
  readonly selected: boolean;
  readonly onPress: () => void;
}) {
  const { palette } = useTheme();
  const { t } = useLocale();
  const facts = useRowFacts(row.farm, now);
  const line = useRowLine(row, facts, me);
  const news = hasNews(row, me, useSeenTo(row.farm)) && !selected;
  // The Chats tab keeps its honey dot for the other tabs while the list is a sidebar.
  useTabDot('chat', news && !row.muted);
  const title =
    row.farmKind === 'visit' ? (row.with?.name ?? t('chat.friendWhoLeft')) : (row.name ?? '');
  return (
    <Press
      onPress={onPress}
      haptic="select"
      radius={ROW.radius}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={[title, line, news ? t('layout.sidebar.somethingNew') : '']
        .filter(Boolean)
        .join(', ')}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: ROW.gap,
        paddingVertical: ROW.padV,
        paddingHorizontal: ROW.padH,
        borderRadius: ROW.radius,
        minHeight: 44,
        backgroundColor: selected ? palette.fillSecondary : 'transparent',
      }}
    >
      {row.farmKind === 'visit' && row.with ? (
        <View style={{ width: ROW.art, height: ROW.art }}>
          <Avatar
            kind={row.with.critter.species}
            look={lookOf(row.with.critter)}
            size={ROW.visitAvatar}
            ring={palette.sheet}
            style={{ position: 'absolute', left: 0, top: 0 }}
          />
          {myCritter ? (
            <Avatar
              kind={myCritter.species}
              look={lookOf(myCritter)}
              size={ROW.visitAvatar}
              ring={palette.sheet}
              style={{ position: 'absolute', right: 0, bottom: 0 }}
            />
          ) : null}
        </View>
      ) : (
        <View
          style={{
            width: ROW.art,
            height: ROW.art,
            borderRadius: ROW.artRadius,
            overflow: 'hidden',
          }}
        >
          <ArtStill
            scene="strip"
            width={ROW.art}
            height={ROW.art}
            attrs={{ season: facts.season }}
          />
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt
          variant="rowTitle"
          numberOfLines={1}
          style={{ fontSize: type.name.size, lineHeight: type.name.lineHeight }}
        >
          {title}
        </Txt>
        <Txt
          variant="caption"
          color={palette.secondary}
          numberOfLines={1}
          style={{ fontSize: type.line.size, lineHeight: type.line.lineHeight }}
        >
          {line}
        </Txt>
      </View>
      {news ? (
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: palette.honey }} />
      ) : null}
    </Press>
  );
}

const MINUTE = 60_000;

function useMinute(): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / MINUTE) * MINUTE);
  useEffect(() => {
    const timer = setInterval(() => setNow(Math.floor(Date.now() / MINUTE) * MINUTE), MINUTE);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/** Whether the person is hibernating, read once for the sidebar's foot. */
function useHibernating(): boolean {
  const client = useDataClient();
  const [hibernating, setHibernating] = useState(false);
  useEffect(() => {
    let live = true;
    client.api.me().then(
      (m) => live && setHibernating(m.hibernating),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [client]);
  return hibernating;
}

/**
 * Farms and visits down the leading side of a large screen (`14 Platforms`): search, each farm
 * and visit with what was said last and a honey dot for something new, and you at the foot.
 * Choosing one shows it beside; nothing is pushed, so the chat beside is always the one chosen.
 */
export function ChatSidebar() {
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();
  const { t } = useLocale();
  const { chats } = useCottage();
  const blocked = useBlockedIds();
  const { farms, visits } = useMemo(() => sectionsOf(chats, blocked), [chats, blocked]);
  const me = useMe();
  const now = useMinute();
  const shown = useShownChat();
  const valley = useValley();
  const segments = useSegments();
  const hibernating = useHibernating();
  const windowed = useWindowed();

  const choose = (row: ChatListItem) => {
    setOpenChat(row.farm);
    if (row.farmKind === 'farm') void valley.choose(row.farm);
    // A chat or its media pushed over the first screen gives way to the one chosen.
    if (segments.length > 2) router.dismissTo('/(tabs)/chat');
  };

  const section = (label: string, list: readonly ChatListItem[]) =>
    list.length === 0 ? null : (
      <>
        <Txt
          variant="label"
          color={palette.secondary}
          accessibilityRole="header"
          style={{ fontSize: 11, paddingTop: 10, paddingBottom: 4, paddingHorizontal: 10 }}
        >
          {label}
        </Txt>
        {list.map((row) => (
          <SidebarRow
            key={row.farm}
            row={row}
            me={me.person}
            myCritter={me.critter}
            now={now}
            selected={row.farm === shown}
            onPress={() => choose(row)}
          />
        ))}
      </>
    );

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: palette.sheet,
        // Clear of the window controls when the app is one window among others.
        paddingTop: insets.top + 12 + (windowed ? screens.windowControls : 0),
        paddingBottom: Math.max(insets.bottom, 12),
        paddingHorizontal: 10,
      }}
    >
      <View style={{ paddingTop: 2, paddingHorizontal: 6, paddingBottom: 8 }}>
        <Press
          onPress={() => go.search(shown ?? undefined)}
          radius={type.search.radius}
          accessibilityRole="search"
          accessibilityLabel={t('layout.sidebar.search')}
          hitSlop={6}
          style={{
            height: type.search.height,
            borderRadius: type.search.radius,
            backgroundColor: palette.card,
            borderWidth: 1,
            borderColor: palette.chip.border,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingHorizontal: 10,
          }}
        >
          <ArtIcon name="search" size={15} color={palette.placeholder} />
          <Txt variant="caption" color={palette.placeholder} style={{ fontSize: type.search.size }}>
            {t('layout.sidebar.search')}
          </Txt>
        </Press>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 2 }}>
        {section(t('layout.sidebar.farms'), farms)}
        {section(t('layout.sidebar.visits'), visits)}
        {farms.length === 0 && visits.length === 0 ? (
          <Txt
            variant="caption"
            multiline
            color={palette.secondary}
            style={{ padding: 10, fontSize: type.line.size }}
          >
            {t('layout.sidebar.empty')}
          </Txt>
        ) : null}
      </ScrollView>
      <Press
        onPress={() => router.navigate('/(tabs)/you')}
        accessibilityRole="button"
        accessibilityLabel={t('layout.sidebar.you')}
        radius={ROW.radius}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10 }}
      >
        {me.critter ? (
          <Avatar kind={me.critter.species} look={lookOf(me.critter)} size={32} />
        ) : (
          <View style={{ width: 32, height: 32 }} />
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt
            variant="rowTitle"
            numberOfLines={1}
            style={{ fontSize: type.footerName.size, lineHeight: type.footerName.lineHeight }}
          >
            {me.name ?? ''}
          </Txt>
          <Txt
            variant="caption"
            color={palette.secondary}
            numberOfLines={1}
            style={{ fontSize: type.footerLine.size, lineHeight: type.footerLine.lineHeight }}
          >
            {hibernating ? t('layout.sidebar.hibernating') : t('layout.sidebar.lampOn')}
          </Txt>
        </View>
        <ArtIcon name="gear" size={20} color={palette.secondary} />
      </Press>
    </View>
  );
}
