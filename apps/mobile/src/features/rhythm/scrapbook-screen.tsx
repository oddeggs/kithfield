import type { FarmId, LocalDate, ScrapbookPage } from '@kithfield/contracts';
import type { FarmView } from '@kithfield/farm';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { rhythmColours } from '@kithfield/theme';

import { useFarmEvents, useFarm, useFarmView, useOpenFarm, useSend } from '../../data';
import { ArtStill } from '../../ui/art/art-view';
import { EmptyState, ErrorState } from '../../ui/components/state-shell';
import { useToast } from '../../ui/components/toast';
import { useLocale } from '../../ui/locale/locale-provider';
import { haptics } from '../../ui/motion/haptics';
import { Press } from '../../ui/motion/press';
import { useTheme } from '../../ui/theme/theme-provider';
import { Txt } from '../../ui/type/text';
import { typeAt } from '../farm/type-at';
import { useNow } from '../farm/use-now';
import { BackButton } from './chrome';
import { handText } from './copy';
import { useRhythmApi } from './rhythm-api';
import {
  pageTilt,
  pressableHangouts,
  pressedArt,
  snapArt,
  type Pressable,
} from './scrapbook-model';

const GAP_X = 12;
const GAP_Y = 14;
const CARD_H = 184;

/** "24 Oct": a page's day, short, in the reader's language. */
function shortDate(at: number | LocalDate, language: string, timeZone: string): string {
  const date = typeof at === 'number' ? new Date(at) : new Date(`${at}T12:00:00Z`);
  return new Intl.DateTimeFormat(language === 'vi' ? 'vi-VN' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    // A page's day is the farm's day, wherever the reader is.
    timeZone: typeof at === 'number' ? timeZone : 'UTC',
  }).format(date);
}

/** A pressed page: its flower, a snapshot taped on, its title and day. */
function PageCard({
  page,
  index,
  width,
  season,
  timeZone,
  onHide,
}: {
  readonly page: ScrapbookPage;
  readonly timeZone: string;
  readonly index: number;
  readonly width: number;
  readonly season: string;
  readonly onHide: (page: ScrapbookPage) => void;
}) {
  const { t, language, fontLocale } = useLocale();
  const { palette, appearance } = useTheme();
  const colours = rhythmColours[appearance];
  const date = shortDate(page.at, language, timeZone);
  const snapTilt = index % 2 === 0 ? -5 : 4;
  return (
    <View
      style={{
        width,
        height: CARD_H,
        borderRadius: 6,
        backgroundColor: colours.page,
        boxShadow: colours.pageShadow,
        transform: [{ rotate: `${pageTilt(index)}deg` }],
      }}
    >
      <Press
        onLongPress={() => onHide(page)}
        radius={6}
        accessibilityLabel={t('rhythm.scrapbook.page', { title: page.title, date })}
        accessibilityHint={t('rhythm.scrapbook.hide')}
        style={{ width, height: CARD_H, borderRadius: 6, overflow: 'hidden' }}
      >
        <ArtStill
          scene="pressed"
          width={78}
          height={112}
          attrs={{ name: pressedArt(page.flower, page.seq) }}
          style={{ position: 'absolute', top: 10, left: 8 }}
        />
        <View
          style={{
            position: 'absolute',
            right: 12,
            top: 22,
            width: 76,
            height: 62,
            borderRadius: 3,
            overflow: 'hidden',
            transform: [{ rotate: `${snapTilt}deg` }],
            boxShadow: colours.snapShadow,
          }}
        >
          <ArtStill
            scene="snap"
            width={76}
            height={62}
            attrs={{ name: snapArt(page.seq), season }}
          />
        </View>
        <View
          style={{
            position: 'absolute',
            right: 30,
            top: 16,
            width: 40,
            height: 12,
            backgroundColor: colours.tape,
            transform: [{ rotate: '-8deg' }],
          }}
        />
        <View style={{ position: 'absolute', left: 12, right: 10, bottom: 12 }}>
          <Txt
            variant="handS"
            multiline
            numberOfLines={2}
            style={typeAt('handS', 17, 17.85, fontLocale)}
          >
            {handText(page.title)}
          </Txt>
          <Txt
            variant="note"
            color={palette.muted}
            style={[typeAt('caption', 12, 12, fontLocale), { marginTop: 4 }]}
          >
            {date}
          </Txt>
        </View>
      </Press>
    </View>
  );
}

/** A hangout ready to press, dashed, waiting to become a page. */
function PressCard({
  item,
  width,
  onPress,
}: {
  readonly item: Pressable;
  readonly width: number;
  readonly onPress: () => void;
}) {
  const { t, language, fontLocale } = useLocale();
  const { palette } = useTheme();
  const from = t('rhythm.scrapbook.pressFrom', {
    title: item.seed.title ?? '',
    date: shortDate(item.day, language, 'UTC'),
  });
  return (
    <Press
      onPress={onPress}
      radius={6}
      accessibilityRole="button"
      accessibilityLabel={`${t('rhythm.scrapbook.press')}. ${from}`}
      style={{
        width,
        height: CARD_H,
        borderRadius: 6,
        borderWidth: 1.5,
        borderStyle: 'dashed',
        borderColor: palette.chevron,
        padding: 12,
        justifyContent: 'flex-end',
        gap: 4,
      }}
    >
      <ArtStill
        scene="pressed"
        width={78}
        height={112}
        attrs={{ name: pressedArt(item.flower, item.seed.seq) }}
        style={{ position: 'absolute', top: 10, left: 8, opacity: 0.55 }}
      />
      <Txt variant="handS" style={typeAt('handS', 17, 17.85, fontLocale)}>
        {handText(t('rhythm.scrapbook.press'))}
      </Txt>
      <Txt variant="note" multiline color={palette.muted}>
        {from}
      </Txt>
    </Press>
  );
}

/**
 * The scrapbook: every hangout pressed into a page with its flower and photos. Any member can
 * hide a page; hidden and unsent pages never come back from the server.
 */
export function ScrapbookScreen({ farm }: { readonly farm: FarmId }) {
  const { t } = useLocale();
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const api = useRhythmApi();
  const toast = useToast();
  const now = useNow();
  useOpenFarm(farm);
  const state = useFarm(farm)?.state ?? null;
  const view = useFarmView<FarmView>(farm, now);
  const events = useFarmEvents(farm, 200);
  const send = useSend(farm);
  const [pages, setPages] = useState<readonly ScrapbookPage[] | null>(null);
  const [more, setMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const [round, setRound] = useState(0);
  const cardW = (width - 32 - GAP_X) / 2;
  const season = state?.season.season ?? 'spring';

  useEffect(() => {
    let live = true;
    setFailed(false);
    api.scrapbook(farm).then(
      (list) => {
        if (!live) return;
        setPages(list.pages);
        setMore(list.more);
      },
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [api, farm, round]);

  const older = async () => {
    const last = pages?.at(-1);
    if (!last || !more) return;
    const list = await api.scrapbook(farm, last.seq).catch(() => null);
    if (!list) return;
    setPages((p) => [...(p ?? []), ...list.pages]);
    setMore(list.more);
  };

  const hide = (page: ScrapbookPage) =>
    Alert.alert(t('rhythm.scrapbook.hideTitle'), t('rhythm.scrapbook.hideBody'), [
      { text: t('rhythm.scrapbook.hideCancel'), style: 'cancel' },
      {
        text: t('rhythm.scrapbook.hide'),
        style: 'destructive',
        onPress: () =>
          void send('scrapbook_page', { action: 'hidden', target: page.seq }).then((sent) => {
            if (sent.status !== 'queued') return;
            setPages((p) => (p ?? []).filter((x) => x.seq !== page.seq));
            toast.show(t('rhythm.scrapbook.hidden'));
          }),
      },
    ]);

  const press = async (item: Pressable) => {
    haptics.soft();
    const sent = await send('scrapbook_page', {
      action: 'pressed',
      title: item.seed.title ?? '',
      seed: item.seed.seq,
      items: [...item.items],
      flower: item.flower,
    });
    if (sent.status !== 'queued') return;
    toast.show(t('rhythm.scrapbook.pressed'));
    setRound((r) => r + 1);
  };

  const pressable =
    state && view && pages ? pressableHangouts(state, pages, events, view.today).slice(0, 1) : [];
  const cards = [
    ...pressable.map((item) => ({ key: `press:${item.seed.seq}`, item })),
    ...(pages ?? []).map((page) => ({ key: `page:${page.seq}`, page })),
  ];
  const rows: (typeof cards)[] = [];
  for (let i = 0; i < cards.length; i += 2) rows.push(cards.slice(i, i + 2));

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 3, paddingBottom: insets.bottom + 120 }}
        onScroll={(e) => {
          const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
          if (layoutMeasurement.height + contentOffset.y > contentSize.height - 400) void older();
        }}
        scrollEventThrottle={200}
      >
        <View style={{ paddingHorizontal: 20 }}>
          <BackButton onPress={() => router.back()} />
        </View>
        <View style={{ paddingHorizontal: 22, marginTop: 8 }}>
          <Txt variant="displayL" multiline accessibilityRole="header">
            {t('rhythm.scrapbook.title')}
          </Txt>
          <Txt variant="sheetBody" multiline color={palette.body} style={{ marginTop: 4 }}>
            {t('rhythm.scrapbook.body')}
          </Txt>
        </View>
        {failed ? (
          <ErrorState
            art={<ArtStill scene="spot" width={240} height={172} attrs={{ name: 'offline' }} />}
            title={t('rhythm.scrapbook.title')}
            body={t('rhythm.loadFailed')}
            action={{ label: t('rhythm.tryAgain'), onPress: () => setRound((r) => r + 1) }}
          />
        ) : pages !== null && cards.length === 0 ? (
          <EmptyState
            art={<ArtStill scene="pressed" width={120} height={170} attrs={{ name: 'daisy' }} />}
            title={t('rhythm.scrapbook.empty.title')}
            body={t('rhythm.scrapbook.empty.body')}
          />
        ) : (
          <View style={{ paddingHorizontal: 16, marginTop: 22, gap: GAP_Y }}>
            {rows.map((row, r) => (
              <View key={r} style={{ flexDirection: 'row', gap: GAP_X }}>
                {row.map((card, c) =>
                  'item' in card ? (
                    <PressCard
                      key={card.key}
                      item={card.item}
                      width={cardW}
                      onPress={() => void press(card.item)}
                    />
                  ) : (
                    <PageCard
                      key={card.key}
                      page={card.page}
                      index={r * 2 + c}
                      width={cardW}
                      season={season}
                      timeZone={state?.timeZone ?? 'UTC'}
                      onHide={hide}
                    />
                  ),
                )}
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
