import type { ChatListItem } from '@kithfield/contracts';
import { layout } from '@kithfield/theme';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCottage } from '../../../data';
import { ArtStill } from '../../../ui/art/art-view';
import { CircleButton } from '../../../ui/components/button';
import { EmptyState } from '../../../ui/components/state-shell';
import { useToast } from '../../../ui/components/toast';
import { useLocale } from '../../../ui/locale/locale-provider';
import { tabBarClearance } from '../../../ui/tab-bar/tab-bar';
import { useTheme } from '../../../ui/theme/theme-provider';
import { Txt } from '../../../ui/type/text';
import { setMuted, chatApi } from '../api/chat-api';
import { sectionsOf } from '../model/chat-list';
import { go } from '../routes';
import { useMe } from '../ui/use-me';
import { ChatRow } from './chat-row';

const MINUTE = 60_000;

/** The time, a minute at a time, so rows say "8:12" and "Tue" without ticking every second. */
function useMinute(): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / MINUTE) * MINUTE);
  useEffect(() => {
    const timer = setInterval(() => setNow(Math.floor(Date.now() / MINUTE) * MINUTE), MINUTE);
    return () => clearInterval(timer);
  }, []);
  return now;
}

type Change = Partial<Pick<ChatListItem, 'muted' | 'pinned'>>;

/** Farms and visits, newest first (04-02). A honey dot means something new, never a count. */
export function ChatListScreen() {
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();
  const { t } = useLocale();
  const toast = useToast();
  const { chats } = useCottage();
  const me = useMe();
  const now = useMinute();
  const [changes, setChanges] = useState<Readonly<Record<string, Change>>>({});
  const [open, setOpen] = useState<string | null>(null);

  // Mute and pin show at once; the cottage's own row takes over once it says the same.
  const rows = useMemo(
    () => chats.map((r) => (changes[r.farm] ? { ...r, ...changes[r.farm] } : r)),
    [chats, changes],
  );
  useEffect(() => {
    setChanges((c) => {
      const left = Object.fromEntries(
        Object.entries(c).filter(([farm, change]) => {
          const row = chats.find((r) => r.farm === farm);
          return row && Object.entries(change).some(([k, v]) => row[k as keyof Change] !== v);
        }),
      );
      return Object.keys(left).length === Object.keys(c).length ? c : left;
    });
  }, [chats]);
  const { farms, visits } = useMemo(() => sectionsOf(rows), [rows]);

  const change = (row: ChatListItem, next: Change, work: () => Promise<void>) => {
    setChanges((c) => ({ ...c, [row.farm]: { ...c[row.farm], ...next } }));
    work().catch(() => {
      setChanges((c) => {
        const { [row.farm]: _undone, ...rest } = c;
        return rest;
      });
      toast.show(t('chat.list.changeFailed'));
    });
  };
  const mute = (row: ChatListItem) =>
    change(row, { muted: !row.muted }, () => setMuted(row.farm, !row.muted));
  const pin = (row: ChatListItem) =>
    change(row, { pinned: !row.pinned }, () => chatApi.setPinned(row.farm, !row.pinned));

  const renderRows = (list: readonly ChatListItem[]) => (
    <View>
      {list.map((row) => (
        <ChatRow
          key={row.farm}
          row={row}
          me={me.person}
          myCritter={me.critter}
          now={now}
          open={open === row.farm}
          onOpen={setOpen}
          onPress={() => go.chat(row.farm)}
          onMute={() => mute(row)}
          onPin={() => pin(row)}
        />
      ))}
    </View>
  );

  const searchFarm = farms[0]?.farm ?? visits[0]?.farm;
  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <View
        style={{
          paddingTop: Math.max(insets.top, 20) + 3,
          paddingHorizontal: layout.marginTitle,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: Math.max(insets.top, 20) + 3 + 44,
        }}
      >
        <Txt variant="displayL" accessibilityRole="header" style={{ lineHeight: 37.4 }}>
          {t('chat.list.title')}
        </Txt>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <CircleButton
            icon="search"
            iconSize={22}
            label={t('chat.list.search')}
            onPress={() => go.search(searchFarm)}
          />
          <CircleButton
            icon="pencil"
            iconSize={22}
            kind="ink"
            label={t('chat.list.newFarm')}
            onPress={go.newFarm}
          />
        </View>
      </View>
      {rows.length === 0 ? (
        <View style={{ flex: 1, paddingBottom: tabBarClearance(insets.bottom) }}>
          <EmptyState
            art={<ArtStill scene="spot" width={300} height={200} attrs={{ name: 'empty' }} />}
            title={t('chat.list.empty.title')}
            body={t('chat.list.empty.body')}
            action={{ label: t('chat.list.newFarm'), onPress: go.newFarm }}
          />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: layout.marginTitle,
            paddingTop: 12,
            paddingBottom: tabBarClearance(insets.bottom),
            gap: 6,
          }}
          onScrollBeginDrag={() => setOpen(null)}
        >
          {farms.length > 0 ? (
            <>
              <Txt variant="label" color={palette.secondary} accessibilityRole="header">
                {t('chat.list.farms')}
              </Txt>
              {renderRows(farms)}
            </>
          ) : null}
          {visits.length > 0 ? (
            <>
              <Txt
                variant="label"
                color={palette.secondary}
                accessibilityRole="header"
                style={farms.length > 0 ? { marginTop: 4 } : null}
              >
                {t('chat.list.visits')}
              </Txt>
              <Txt
                variant="caption"
                multiline
                color={palette.secondary}
                style={{ fontSize: 13, lineHeight: 17.55, marginTop: -2, marginBottom: 2 }}
              >
                {t('chat.list.visitsNote')}
              </Txt>
              {renderRows(visits)}
            </>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}
