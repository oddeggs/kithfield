import type { FarmState, MediaRef, PersonId } from '@kithfield/contracts';
import { fontFor } from '@kithfield/theme';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActionSheetIOS, ScrollView, TextInput, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCottage } from '../../../data';
import { ArtIcon, ArtStill } from '../../../ui/art/art-view';
import { Avatar } from '../../../ui/art/avatar';
import { useLocale } from '../../../ui/locale/locale-provider';
import { crossTo } from '../../../ui/motion/motion';
import { Press } from '../../../ui/motion/press';
import { useTheme } from '../../../ui/theme/theme-provider';
import { componentType } from '../../../ui/type/styles';
import { Txt } from '../../../ui/type/text';
import { useSignedUrl } from '../api/signed-urls';
import { shortDate } from '../model/format';
import { siteOf } from '../model/media';
import { lookOf } from '../model/people';
import { filterHits, highlight, type Hit, type SearchTab } from '../model/search';
import { go } from '../routes';
import { useChatColours } from '../ui/chat-colours';
import { useMe } from '../ui/use-me';
import { useFarmStates, useHitMedia, useSearch } from './use-search';

const TABS: readonly SearchTab[] = ['messages', 'photos', 'links', 'voice'];
const ALL = '*';

function Marked({
  text,
  query,
  bold = false,
}: {
  readonly text: string;
  readonly query: string;
  readonly bold?: boolean;
}) {
  const colours = useChatColours();
  const { palette } = useTheme();
  return (
    <Txt
      variant="body"
      multiline
      color={bold ? palette.text : palette.appearance === 'day' ? '#4a3f37' : palette.text}
      style={
        bold
          ? { fontSize: 14.5, lineHeight: 18.85, fontWeight: '600' }
          : { fontSize: 14.5, lineHeight: 20.3 }
      }
    >
      {highlight(text, query).map((m, i) =>
        m.hit ? (
          <Txt key={i} variant="body" style={{ backgroundColor: colours.mark, fontSize: 14.5 }}>
            {m.text}
          </Txt>
        ) : (
          m.text
        ),
      )}
    </Txt>
  );
}

function Pill({
  label,
  on,
  small = false,
  onPress,
}: {
  readonly label: string;
  readonly on: boolean;
  readonly small?: boolean;
  readonly onPress: () => void;
}) {
  const { palette } = useTheme();
  const h = small ? 28 : 32;
  return (
    <Press
      onPress={onPress}
      haptic="select"
      radius={h / 2}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={label}
      hitSlop={(44 - h) / 2}
      style={{
        height: h,
        paddingHorizontal: 13,
        borderRadius: h / 2,
        justifyContent: 'center',
        backgroundColor: on ? palette.chip.selectedBg : small ? palette.fillSoft : palette.card,
        borderWidth: 1,
        borderColor: on ? palette.chip.selectedBg : palette.chip.border,
      }}
    >
      <Txt
        variant="chip"
        medium
        color={on ? palette.chip.selectedFg : palette.text}
        style={small ? { fontSize: 13 } : null}
      >
        {label}
      </Txt>
    </Press>
  );
}

function Tile({
  media,
  size,
  onPress,
}: {
  readonly media: MediaRef;
  readonly size: number;
  readonly onPress: () => void;
}) {
  const { palette } = useTheme();
  const url = useSignedUrl(media.mime.startsWith('image/') ? media.key : null);
  return (
    <Press
      onPress={onPress}
      darken={false}
      accessibilityRole="imagebutton"
      style={{
        width: size,
        height: 112,
        borderRadius: 12,
        overflow: 'hidden',
        backgroundColor: palette.fillSoft,
      }}
    >
      {url ? (
        <Image
          source={{ uri: url }}
          style={{ width: size, height: 112 }}
          contentFit="cover"
          transition={120}
        />
      ) : null}
    </Press>
  );
}

/** Search (04-11): messages, photos, links and voice notes, by person and farm; 12-03 when nothing matches. */
export function SearchScreen({ farm: start }: { readonly farm: string | null }) {
  const { palette } = useTheme();
  const colours = useChatColours();
  const { t, language, fontLocale } = useLocale();
  const insets = useSafeAreaInsets();
  const { chats } = useCottage();
  const me = useMe();
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<SearchTab>('messages');
  const [where, setWhere] = useState<string>(start ?? ALL);
  const [person, setPerson] = useState<PersonId | null>(null);
  const farms = useMemo(() => (where === ALL ? chats.map((c) => c.farm) : [where]), [where, chats]);
  const states = useFarmStates(farms);
  const result = useSearch(farms, query);
  const hits = result.status === 'idle' ? [] : result.hits;
  const now = Date.now();
  const titleOf = (farm: string) => {
    const row = chats.find((c) => c.farm === farm);
    return row?.name ?? row?.with?.name ?? states[farm]?.name ?? '';
  };
  const memberOf = (farm: string, p: PersonId | null) => {
    const s: FarmState | null | undefined = states[farm];
    const id = p ? (s?.aliases[p] ?? p) : null;
    return (
      s?.members.find((m) => m.person === id) ?? s?.former.find((m) => m.person === id) ?? null
    );
  };
  const shown = filterHits(hits, tab, { person });
  const photos = filterHits(hits, 'photos', { person });
  const links = filterHits(hits, 'links', { person });
  const media = useHitMedia(tab === 'messages' || tab === 'photos' ? photos : []);

  // Results cross-fade as the words change, without the layout jumping.
  const fade = useSharedValue(1);
  useEffect(() => {
    fade.set(0.35);
    fade.set(crossTo(1));
  }, [result, fade]);
  const faded = useAnimatedStyle(() => ({ opacity: fade.get() }));

  const open = (hit: Hit) => {
    router.back();
    go.chat(hit.farm, { seq: String(hit.seq) });
  };
  const nameFor = (farm: string, p: PersonId | null) =>
    p !== null && p === me.person
      ? t('chat.you')
      : (memberOf(farm, p)?.name ?? t('chat.friendWhoLeft'));
  const dateOf = (at: number) => {
    const d = shortDate(at, now, language);
    return d === 'today'
      ? t('chat.search.today')
      : d === 'yesterday'
        ? t('chat.search.yesterday')
        : d;
  };

  const pickPerson = () => {
    const people = farms
      .flatMap((f) => states[f]?.members ?? [])
      .filter((m, i, all) => all.findIndex((x) => x.person === m.person) === i);
    const options = [
      t('chat.search.fromAnyone'),
      ...people.map((m) => (m.person === me.person ? t('chat.you') : (m.name ?? ''))),
    ];
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: t('chat.search.pickPerson'),
        options: [...options, t('chat.search.cancel')],
        cancelButtonIndex: options.length,
      },
      (i) => {
        if (i === 0) setPerson(null);
        else if (i < options.length) setPerson(people[i - 1]?.person ?? null);
      },
    );
  };
  const pickFarm = () => {
    const options = [t('chat.search.allFarms'), ...chats.map((c) => titleOf(c.farm))];
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: t('chat.search.pickFarm'),
        options: [...options, t('chat.search.cancel')],
        cancelButtonIndex: options.length,
      },
      (i) => {
        if (i === 0) setWhere(ALL);
        else if (i < options.length) setWhere(chats[i - 1]?.farm ?? ALL);
        setPerson(null);
      },
    );
  };

  const font = fontFor(componentType.fieldText, fontLocale, { multiline: false });
  const nothing =
    result.status === 'done' &&
    shown.length === 0 &&
    (tab !== 'messages' || (photos.length === 0 && links.length === 0));
  const seeker =
    chats.length > 0
      ? (states[farms[0] ?? '']?.members.find((m) => m.person !== me.person) ?? null)
      : null;
  const personLabel = person
    ? t('chat.search.from', { name: nameFor(farms[0] ?? '', person) })
    : t('chat.search.fromAnyone');

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: palette.background,
        paddingTop: Math.max(insets.top, 20) + 4,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16 }}>
        <View
          style={{
            flex: 1,
            minHeight: 44,
            borderRadius: 16,
            backgroundColor: palette.card,
            borderWidth: 2,
            borderColor: colours.searchBorder,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            paddingHorizontal: 16,
          }}
        >
          <ArtIcon name="search" size={18} color={palette.secondary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            autoFocus
            returnKeyType="search"
            placeholder={t('chat.search.placeholder')}
            placeholderTextColor={palette.placeholder}
            selectionColor={palette.go.bg}
            accessibilityLabel={t('chat.search.placeholder')}
            style={[
              font,
              {
                flex: 1,
                color: palette.text,
                fontWeight: '600',
                fontSize: 16,
                lineHeight: undefined,
                paddingVertical: 10,
              },
            ]}
          />
        </View>
        <Press
          onPress={() => router.back()}
          darken={false}
          hitSlop={10}
          accessibilityLabel={t('chat.search.cancel')}
        >
          <Txt variant="buttonText" color={palette.go.bg} style={{ fontSize: 16 }}>
            {t('chat.search.cancel')}
          </Txt>
        </Press>
      </View>
      <View style={{ paddingHorizontal: 16, paddingTop: 14, gap: 12 }}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {TABS.map((k) => (
            <Pill key={k} label={t(`chat.search.${k}`)} on={tab === k} onPress={() => setTab(k)} />
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <Pill small on={false} label={`${personLabel} ▾`} onPress={pickPerson} />
          <Pill
            small
            on={false}
            label={`${where === ALL ? t('chat.search.allFarms') : titleOf(where)} ▾`}
            onPress={pickFarm}
          />
        </View>
      </View>
      {nothing ? (
        <View style={{ alignItems: 'center', paddingHorizontal: 36, paddingTop: 20 }}>
          <ArtStill
            scene="spot"
            width={300}
            height={200}
            attrs={{ name: 'search', ...(seeker ? { kind: seeker.critter.species } : {}) }}
          />
          <Txt
            variant="displayM"
            multiline
            align="center"
            style={{ marginTop: 20 }}
            accessibilityRole="header"
          >
            {t('chat.search.empty.title', { name: seeker?.name ?? 'Bram' })}
          </Txt>
          <Txt
            variant="sheetBody"
            multiline
            align="center"
            color={palette.body}
            style={{ marginTop: 8 }}
          >
            {where === ALL
              ? t('chat.search.empty.bodyAll')
              : t('chat.search.empty.body', { farm: titleOf(where) })}
          </Txt>
          {where !== ALL ? (
            <Press
              onPress={() => setWhere(ALL)}
              radius={20}
              accessibilityLabel={t('chat.search.empty.action')}
              style={{
                marginTop: 16,
                height: 40,
                paddingHorizontal: 13,
                borderRadius: 20,
                backgroundColor: palette.primary.bg,
                justifyContent: 'center',
              }}
            >
              <Txt variant="chip" medium color={palette.primary.fg}>
                {t('chat.search.empty.action')}
              </Txt>
            </Press>
          ) : null}
        </View>
      ) : (
        <Animated.View style={[{ flex: 1 }, faded]}>
          <ScrollView
            keyboardDismissMode="on-drag"
            contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 12 }}
          >
            {result.status === 'idle' ? (
              <Txt variant="caption" multiline color={palette.secondary} align="center">
                {t('chat.search.hint', {
                  farm: where === ALL ? t('chat.search.allFarms') : titleOf(where),
                })}
              </Txt>
            ) : null}
            {result.status === 'done' && result.offline ? (
              <Txt variant="caption" color={palette.secondary} align="center">
                {t('chat.search.offline')}
              </Txt>
            ) : null}
            {tab === 'messages' || tab === 'voice' ? (
              shown.length > 0 ? (
                <View
                  style={{
                    borderRadius: 22,
                    backgroundColor: palette.card,
                    paddingVertical: 2,
                    paddingHorizontal: 14,
                  }}
                >
                  {shown.slice(0, 40).map((hit, i) => {
                    const m = memberOf(hit.farm, hit.actor);
                    return (
                      <Press
                        key={`${hit.farm}:${hit.seq}`}
                        onPress={() => open(hit)}
                        darken={false}
                        accessibilityLabel={`${nameFor(hit.farm, hit.actor)}, ${dateOf(hit.at)}: ${hit.text}`}
                        style={{
                          flexDirection: 'row',
                          gap: 10,
                          paddingVertical: 11,
                          borderBottomWidth: i < Math.min(shown.length, 40) - 1 ? 1 : 0,
                          borderBottomColor: colours.rowRule,
                        }}
                      >
                        {m ? (
                          <Avatar kind={m.critter.species} look={lookOf(m.critter)} size={34} />
                        ) : (
                          <View style={{ width: 34 }} />
                        )}
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                            <Txt variant="rowTitle" style={{ fontSize: 14, lineHeight: 16.8 }}>
                              {nameFor(hit.farm, hit.actor)}
                              {where === ALL ? ` · ${titleOf(hit.farm)}` : ''}
                            </Txt>
                            <Txt
                              variant="caption"
                              color={palette.secondary}
                              style={{ fontSize: 13, lineHeight: 13 }}
                            >
                              {dateOf(hit.at)}
                            </Txt>
                          </View>
                          <View style={{ marginTop: 2 }}>
                            <Marked text={hit.text} query={query} />
                          </View>
                        </View>
                      </Press>
                    );
                  })}
                </View>
              ) : null
            ) : null}
            {(tab === 'messages' || tab === 'photos') && photos.length > 0 ? (
              <>
                {tab === 'messages' ? (
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                    }}
                  >
                    <Txt variant="label" color={palette.secondary}>
                      {t('chat.search.photos')}
                    </Txt>
                    <Press
                      onPress={() => setTab('photos')}
                      darken={false}
                      accessibilityLabel={t('chat.search.seeAll', { count: photos.length })}
                    >
                      <Txt variant="buttonSmall" color={palette.go.bg}>
                        {t('chat.search.seeAll', { count: photos.length })}
                      </Txt>
                    </Press>
                  </View>
                ) : null}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                  {photos
                    .flatMap((hit) =>
                      (media[`${hit.farm}:${hit.seq}`] ?? []).map((ref, index) => ({
                        hit,
                        ref,
                        index,
                      })),
                    )
                    .slice(0, tab === 'messages' ? 3 : 60)
                    .map(({ hit, ref, index }) => (
                      <Tile
                        key={ref.key}
                        media={ref}
                        size={(361 - 8) / 3}
                        onPress={() => {
                          router.back();
                          go.viewer(hit.farm, hit.seq, index);
                        }}
                      />
                    ))}
                </View>
              </>
            ) : null}
            {(tab === 'messages' || tab === 'links') && links.length > 0 ? (
              <>
                {tab === 'messages' ? (
                  <Txt variant="label" color={palette.secondary}>
                    {t('chat.search.links')}
                  </Txt>
                ) : null}
                {links.slice(0, tab === 'messages' ? 3 : 40).map((hit) => (
                  <Press
                    key={`${hit.farm}:${hit.seq}`}
                    onPress={() => open(hit)}
                    darken={false}
                    accessibilityLabel={hit.text}
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
                        backgroundColor: palette.fillSoft,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <ArtIcon name="link" size={24} color={palette.secondary} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Marked
                        text={hit.text.replace(/\s*https?:\/\/\S+$/, '')}
                        query={query}
                        bold
                      />
                      <Txt
                        variant="caption"
                        color={palette.secondary}
                        numberOfLines={1}
                        style={{ fontSize: 13, lineHeight: 16.9 }}
                      >
                        {siteOf(/https?:\/\/\S+/.exec(hit.text)?.[0] ?? '')}
                      </Txt>
                    </View>
                  </Press>
                ))}
              </>
            ) : null}
          </ScrollView>
        </Animated.View>
      )}
    </View>
  );
}
