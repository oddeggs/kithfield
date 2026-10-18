import { parseEvent } from '@kithfield/contracts';
import * as MediaLibrary from 'expo-media-library/legacy';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActionSheetIOS, ScrollView, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDataClient, useFarm } from '../../../data';
import { ArtIcon, ArtStill } from '../../../ui/art/art-view';
import { Segmented } from '../../../ui/components/segmented';
import { EmptyState } from '../../../ui/components/state-shell';
import { useToast } from '../../../ui/components/toast';
import { useLocale } from '../../../ui/locale/locale-provider';
import { Press } from '../../../ui/motion/press';
import { useTheme } from '../../../ui/theme/theme-provider';
import { Txt } from '../../../ui/type/text';
import { MediaImage, useMediaUrl } from '../../media';
import { useChatApi } from '../api/chat-api';
import { clock, monthHeading } from '../model/format';
import { localCopy } from './local-copy';
import { byMonth, sharedItems, type MediaTab, type SharedItem } from '../model/media';
import type { LogEvent } from '../model/timeline';
import { go } from '../routes';
import { BackGlyph } from '../room/header';
import { useChatColours } from '../ui/chat-colours';

const TABS: readonly MediaTab[] = ['photos', 'videos', 'links', 'voice'];
const GAP = 3;

/** Every shared item on the farm: the phone's cache, then the farm's own pages further back. */
function useShared(farm: string) {
  const client = useDataClient();
  const chatApi = useChatApi();
  const lastSeq = useFarm(farm)?.lastSeq ?? 0;
  const [cached, setCached] = useState<readonly LogEvent[]>([]);
  const [older, setOlder] = useState<readonly LogEvent[]>([]);
  const [more, setMore] = useState(true);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let live = true;
    void client.events(farm, { limit: 2000 }).then((e) => live && setCached(e));
    return () => {
      live = false;
    };
  }, [client, farm, lastSeq]);
  const all = useMemo(() => {
    const bySeq = new Map<number, LogEvent>();
    for (const e of older) bySeq.set(e.seq, e);
    for (const e of cached) bySeq.set(e.seq, e);
    return [...bySeq.values()].sort((a, b) => a.seq - b.seq);
  }, [cached, older]);
  const loadMore = useCallback(async () => {
    if (loading || !more) return;
    setLoading(true);
    try {
      const oldest = all[0]?.seq ?? null;
      const page = await chatApi.sharedPage(farm, oldest);
      const events: LogEvent[] = [];
      for (const raw of page.events) {
        const parsed = parseEvent(raw);
        if (parsed.status === 'known') events.push({ ...parsed.event, known: true });
      }
      setOlder((o) => [...events, ...o]);
      setMore(page.more);
    } catch {
      setMore(false);
    } finally {
      setLoading(false);
    }
  }, [all, chatApi, farm, loading, more]);
  useEffect(() => {
    // The cache may hold only recent days: ask the farm for what came before.
    if (all.length > 0 && (all[0]?.seq ?? 1) > 1) void loadMore();
    // Only once the cache has been read.
  }, [cached.length > 0]);
  return { items: useMemo(() => sharedItems(all), [all]), loading, loadMore };
}

function Tile({
  item,
  size,
  onPress,
  onLong,
}: {
  readonly item: SharedItem;
  readonly size: number;
  readonly onPress: () => void;
  /** With where the file can be read from, once known. */
  readonly onLong: (url: string | null) => void;
}) {
  const colours = useChatColours();
  const { palette } = useTheme();
  const { t } = useLocale();
  const url = useMediaUrl(item.ref?.key ?? null);
  return (
    <Press
      onPress={onPress}
      onLongPress={() => onLong(url)}
      darken={false}
      accessibilityLabel={
        item.tab === 'videos' ? t('chat.bubble.openVideo') : t('chat.bubble.openMedia')
      }
      style={{
        width: size,
        height: 124,
        borderRadius: 6,
        overflow: 'hidden',
        backgroundColor: palette.fillSoft,
      }}
    >
      {item.tab === 'photos' && item.ref ? (
        <MediaImage mediaKey={item.ref.key} style={{ width: size, height: 124 }} />
      ) : null}
      {item.tab === 'videos' ? (
        <View
          style={{
            position: 'absolute',
            right: 6,
            bottom: 6,
            paddingVertical: 3,
            paddingHorizontal: 6,
            borderRadius: 8,
            backgroundColor: colours.mediaBadge,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 3,
          }}
        >
          <ArtIcon name="play" size={9} color={colours.onMedia} />
          <Txt variant="bubbleState" color={colours.onMedia} style={{ fontSize: 11 }}>
            {clock(item.durationMs ?? 0)}
          </Txt>
        </View>
      ) : null}
    </Press>
  );
}

/** Shared on the farm: photos, videos, links and voice notes, grouped by month. */
export function MediaScreen({ farm }: { readonly farm: string }) {
  const { palette } = useTheme();
  const { t, language } = useLocale();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const visit = useFarm(farm)?.state?.kind === 'visit';
  const [tab, setTab] = useState<MediaTab>('photos');
  const { items, loading, loadMore } = useShared(farm);
  const now = Date.now();
  const shown = items.filter((i) => i.tab === tab);
  const groups = byMonth(shown);
  const tile = (width - 24 - GAP * 2) / 3;

  const save = async (item: SharedItem, url: string | null) => {
    if (!item.ref || url === null) return;
    const permission = await MediaLibrary.requestPermissionsAsync(true);
    if (!permission.granted) {
      toast.show(t('chat.media.saveFailed'));
      return;
    }
    await MediaLibrary.saveToLibraryAsync(
      await localCopy(url, item.ref, `${item.seq}-${item.index}`),
    );
    toast.show(t('chat.media.saved'));
  };
  const actions = (item: SharedItem, url: string | null) => {
    const options = [t('chat.media.save'), t('chat.media.forward'), t('chat.search.cancel')];
    ActionSheetIOS.showActionSheetWithOptions({ options, cancelButtonIndex: 2 }, (i) => {
      if (i === 0) void save(item, url);
      if (i === 1) go.forward(farm, item.seq);
    });
  };

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: palette.background,
        paddingTop: Math.max(insets.top - 1, 20),
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
        }}
      >
        <Press
          onPress={() => router.back()}
          radius={22}
          accessibilityLabel={t('chat.room.back')}
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: palette.fillSoft,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <BackGlyph />
        </Press>
        <Txt variant="rowTitle" accessibilityRole="header" style={{ fontSize: 17 }}>
          {visit ? t('chat.media.titleVisit') : t('chat.media.title')}
        </Txt>
        <View style={{ width: 44 }} />
      </View>
      <View style={{ paddingHorizontal: 16, marginTop: 10 }}>
        <Segmented
          label={t('chat.media.title')}
          value={tab}
          onChange={setTab}
          segments={TABS.map((k) => ({ value: k, label: t(`chat.media.${k}`) }))}
        />
      </View>
      {shown.length === 0 && !loading ? (
        <EmptyState
          art={<ArtStill scene="spot" width={300} height={200} attrs={{ name: 'media' }} />}
          title={t(`chat.media.${tab}`)}
          body={t('chat.media.empty')}
        />
      ) : (
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 12,
            paddingTop: 16,
            paddingBottom: insets.bottom + 24,
            gap: 10,
          }}
          onScroll={(e) => {
            const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
            if (contentOffset.y + layoutMeasurement.height > contentSize.height - 400)
              void loadMore();
          }}
          scrollEventThrottle={200}
        >
          {groups.map((group, g) => (
            <View key={group.month} style={{ gap: 10 }}>
              <Txt
                variant="displayS"
                accessibilityRole="header"
                // Drawn 20 on 20 like the design, in a taller line so the capitals aren't clipped.
                style={{
                  fontSize: 20,
                  lineHeight: 26,
                  marginVertical: -3,
                  paddingHorizontal: 4,
                  paddingTop: g === 0 ? 0 : 6,
                }}
              >
                {monthHeading(group.at, now, language)}
              </Txt>
              {tab === 'photos' || tab === 'videos' ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP }}>
                  {group.items.map((item) => (
                    <Tile
                      key={`${item.seq}:${item.index}`}
                      item={item}
                      size={tile}
                      onPress={() => go.viewer(farm, item.seq, item.index)}
                      onLong={(url) => actions(item, url)}
                    />
                  ))}
                </View>
              ) : (
                group.items.map((item) => (
                  <ListItem key={`${item.seq}:${item.index}`} item={item} farm={farm} />
                ))
              )}
            </View>
          ))}
          {loading ? (
            <Txt variant="caption" align="center" color={palette.secondary}>
              {t('chat.media.more')}
            </Txt>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

function ListItem({ item, farm }: { readonly item: SharedItem; readonly farm: string }) {
  const { palette } = useTheme();
  const { t } = useLocale();
  const voice = item.tab === 'voice';
  return (
    <Press
      onPress={() =>
        voice || !item.url
          ? go.chat(farm, { seq: String(item.seq) })
          : void WebBrowser.openBrowserAsync(item.url)
      }
      darken={false}
      accessibilityLabel={
        voice
          ? t('chat.what.voice', { duration: clock(item.durationMs ?? 0) })
          : `${item.title ?? item.url ?? ''}, ${item.site ?? ''}`
      }
      style={{
        borderRadius: 18,
        backgroundColor: palette.card,
        borderWidth: 1,
        borderColor: palette.cardBorder,
        padding: 10,
        flexDirection: 'row',
        gap: 10,
        alignItems: 'center',
      }}
    >
      <View
        style={{
          width: 52,
          height: 52,
          borderRadius: 10,
          backgroundColor: voice ? palette.honey : palette.fillSoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ArtIcon name={voice ? 'mic' : 'link'} size={24} color={palette.text} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="rowTitle" numberOfLines={2} style={{ fontSize: 14.5 }}>
          {voice
            ? t('chat.what.voice', { duration: clock(item.durationMs ?? 0) })
            : (item.title ?? item.url ?? '')}
        </Txt>
        {!voice ? (
          <Txt
            variant="caption"
            color={palette.secondary}
            numberOfLines={1}
            style={{ fontSize: 13 }}
          >
            {item.site ?? ''}
          </Txt>
        ) : null}
      </View>
    </Press>
  );
}
