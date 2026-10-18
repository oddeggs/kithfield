import type { FarmState, StickerPayload } from '@kithfield/contracts';
import { motion } from '@kithfield/theme';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useFarm, useSend } from '../../../data';
import { Chip } from '../../../ui/components/chip';
import { useToast } from '../../../ui/components/toast';
import { useLocale } from '../../../ui/locale/locale-provider';
import { Press } from '../../../ui/motion/press';
import { useTheme } from '../../../ui/theme/theme-provider';
import { Txt } from '../../../ui/type/text';
import { useCollection, useRecents, useTogetherPeople, type RecentSticker } from '../data';
import { offered, OWN, type PackId } from '../model/catalogue';
import { sceneOfSticker, NO_CAPTION, type StickerPerson } from '../model/look';
import { ownedPacks, packHint, type OwnedPack } from '../model/owned';
import { farmTogether } from '../model/together';
import { stickerRoutes } from '../routes';
import { useStickerColours } from '../ui/colours';
import { StickerArt } from '../ui/sticker';
import { StickerGrid, type GridSticker, type Viewport } from '../ui/sticker-grid';
import { useMe } from '../ui/use-me';
import { wornName } from '../ui/worn';

/** Stickers in the grid, and the tab icons. */
const STICKER = 80;
const TAB_ICON = 44;
const PREVIEW = 230;

/** A tab of the picker: your pack, together stickers, or a pack you own. */
type Tab =
  | { readonly id: 'mine' }
  | { readonly id: 'together' }
  | { readonly id: PackId; readonly owned: OwnedPack };

const keyOf = (s: RecentSticker) => `${s.pack}/${s.sticker}/${(s.with ?? []).join(',')}`;

/** The farm's people as stickers draw them. */
function peopleOf(state: FarmState | null) {
  return (person: string): StickerPerson | null => {
    const kept = state?.aliases?.[person] ?? person;
    const m = state?.members.find((x) => x.person === kept);
    return m ? { name: m.name, critter: m.critter } : null;
  };
}

/**
 * The sticker picker over a farm's chat: your own pack, always wearing what your critter has on
 * now, together stickers with this farm's friends, and the packs you own. Tap sends; a long press
 * shows a sticker bigger; the Shop has the rest.
 */
export function PickerScreen({ farm }: { readonly farm: string }) {
  const { t } = useLocale();
  const { palette } = useTheme();
  const sc = useStickerColours();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const state = useFarm(farm)?.state ?? null;
  const send = useSend(farm);
  const me = useMe();
  const { collection } = useCollection();
  const drawable = useTogetherPeople(farm);
  const { recents, add } = useRecents(farm);
  const [tab, setTab] = useState<string>('mine');
  const [preview, setPreview] = useState<RecentSticker | null>(null);
  const [viewport, setViewport] = useState<Viewport | null>(null);

  const personOf = useMemo(() => peopleOf(state), [state]);
  const myMember = state?.members.find((m) => m.person === me.person) ?? null;
  const sender: StickerPerson | null = myMember
    ? { name: myMember.name, critter: myMember.critter }
    : me.critter
      ? { name: me.name, critter: me.critter }
      : null;

  // Friends who can be drawn in, in the order they moved in.
  const friends = useMemo(() => {
    const ok = new Set(drawable ?? []);
    return [...(state?.members ?? [])]
      .filter((m) => m.person !== me.person && ok.has(m.person))
      .sort((a, b) => a.joinedAt - b.joinedAt)
      .map((m) => m.person);
  }, [state, drawable, me.person]);

  const packs = ownedPacks(collection);
  const tabs: Tab[] = [
    { id: 'mine' },
    ...(friends.length > 0 ? [{ id: 'together' } as const] : []),
    ...packs.filter((p) => p.pack.id !== OWN).map((owned) => ({ id: owned.pack.id, owned })),
  ];
  const current = tabs.find((x) => x.id === tab) ?? tabs[0] ?? { id: 'mine' };

  const draw = (s: RecentSticker, caption = true) => {
    const attrs = sceneOfSticker(t, s, sender, personOf);
    return caption ? attrs : { ...attrs, caption: NO_CAPTION };
  };

  const stickersOf = (x: Tab): RecentSticker[] => {
    if (x.id === 'together') {
      return farmTogether(friends).map((o) => ({ pack: OWN, sticker: o.def.id, with: o.with }));
    }
    const pack = x.id === 'mine' ? packs[0]?.pack : x.owned.pack;
    return pack ? offered(pack).map((st) => ({ pack: pack.id, sticker: st.id })) : [];
  };

  const labelOf = (x: Tab): { label: string; hint: string } => {
    if (x.id === 'mine') {
      const worn = wornName(t, sender?.critter ?? null);
      return {
        label: t('stickers.pack.mine'),
        hint: worn
          ? sender?.critter.outfit
            ? t('stickers.picker.mine.hintOutfit')
            : t('stickers.picker.mine.hint', { item: worn })
          : t('stickers.picker.mine.hintOwn'),
      };
    }
    if (x.id === 'together') {
      const farmName = state?.name ?? personOf(friends[0] ?? '')?.name ?? '';
      return {
        label: t('stickers.picker.together'),
        hint: t('stickers.picker.together.hint', { farm: farmName }),
      };
    }
    const hint = packHint(x.owned, state);
    return {
      label: t(`stickers.pack.${x.id}`),
      hint:
        hint.kind === 'gift'
          ? t('stickers.picker.gift.hint', {
              name: personOf(hint.from)?.name ?? t('stickers.someone'),
            })
          : hint.kind === 'bought'
            ? t('stickers.picker.bought.hint', { season: t(`stickers.season.${hint.season}`) })
            : t('stickers.picker.yours.hint'),
    };
  };

  const iconOf = (x: Tab): RecentSticker => {
    if (x.id === 'mine') return { pack: OWN, sticker: 'face' };
    if (x.id === 'together') return { pack: OWN, sticker: 'us', with: friends.slice(0, 1) };
    return { pack: x.id, sticker: offered(x.owned.pack)[0]?.id ?? '' };
  };

  const doSend = (s: RecentSticker) => {
    setPreview(null);
    const payload: StickerPayload = {
      pack: s.pack,
      sticker: s.sticker,
      ...(s.with && s.with.length > 0 ? { with: [...s.with] } : {}),
    };
    void send('sticker', payload).then((result) => {
      if (result.status === 'queued') {
        add(s);
        if (router.canGoBack()) router.back();
      } else {
        toast.show(t('stickers.picker.refused'));
      }
    });
  };

  const shown = stickersOf(current);
  const byKey = new Map([...shown, ...recents].map((s) => [keyOf(s), s]));
  const grid = (list: readonly RecentSticker[]): GridSticker[] =>
    list.map((s) => {
      const attrs = draw(s);
      return {
        key: keyOf(s),
        attrs,
        label: t('stickers.picker.send', {
          caption: attrs['caption'] === NO_CAPTION ? '' : (attrs['caption'] ?? ''),
        }),
      };
    });
  const { label, hint } = labelOf(current);
  const showRecents = current.id === 'mine' && recents.length > 0;

  return (
    <View style={{ flex: 1, backgroundColor: palette.sheet }}>
      {/* Keeps the scroll view off the native sheet's first-view path, where the sheet would
          stretch it to its own frame. */}
      <View collapsable={false} />
      <ScrollView
        style={{ flex: 1 }}
        stickyHeaderIndices={[0]}
        contentContainerStyle={{
          paddingBottom: insets.bottom + 24,
          gap: 4,
        }}
        scrollEventThrottle={100}
        onLayout={(e) => {
          const height = e.nativeEvent.layout.height;
          setViewport((v) => ({ top: v?.top ?? 0, scrollY: v?.scrollY ?? 0, height }));
        }}
        onScroll={(e) => {
          const scrollY = e.nativeEvent.contentOffset.y;
          setViewport((v) => ({ top: v?.top ?? 0, height: v?.height ?? 0, scrollY }));
        }}
      >
        <View
          style={{
            paddingTop: 25,
            paddingBottom: 10,
            paddingHorizontal: 16,
            gap: 10,
            backgroundColor: palette.sheet,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {tabs.map((x) => {
              const on = x.id === current.id;
              const icon = draw(iconOf(x), false);
              return (
                <Press
                  key={x.id}
                  onPress={() => setTab(x.id)}
                  haptic="select"
                  radius={14}
                  darken={false}
                  accessibilityLabel={labelOf(x).label}
                  accessibilityState={{ selected: on }}
                  style={{
                    width: 52,
                    height: 44,
                    borderRadius: 14,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: on ? sc.tabOn : 'transparent',
                  }}
                >
                  <StickerArt attrs={icon} size={TAB_ICON} still />
                </Press>
              );
            })}
            <View style={{ flex: 1 }} />
            <Press
              onPress={() => router.push(stickerRoutes.shop(farm))}
              radius={18}
              accessibilityLabel={t('stickers.picker.shop')}
              style={{
                height: 36,
                paddingHorizontal: 12,
                borderRadius: 18,
                justifyContent: 'center',
                backgroundColor: sc.pill,
              }}
            >
              <Txt variant="buttonSmall" style={{ fontSize: 13 }}>
                {t('stickers.picker.shop')}
              </Txt>
            </Press>
          </View>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'baseline',
            }}
          >
            <Txt variant="buttonSmall" accessibilityRole="header">
              {label}
            </Txt>
            <Txt variant="handS" color={palette.muted}>
              {hint}
            </Txt>
          </View>
        </View>
        {showRecents ? (
          <View style={{ gap: 6, paddingHorizontal: 16 }}>
            <Txt variant="label" color={palette.muted}>
              {t('stickers.picker.recent')}
            </Txt>
            <StickerGrid
              stickers={grid(recents)}
              size={STICKER}
              rowGap={4}
              hint={t('stickers.picker.sendHint')}
              onPress={(k) => {
                const s = byKey.get(k);
                if (s) doSend(s);
              }}
              onLongPress={(k) => setPreview(byKey.get(k) ?? null)}
            />
          </View>
        ) : null}
        <View
          style={{ paddingHorizontal: 16 }}
          onLayout={(e) => {
            const top = e.nativeEvent.layout.y;
            setViewport((v) => ({ scrollY: v?.scrollY ?? 0, height: v?.height ?? 0, top }));
          }}
        >
          <StickerGrid
            stickers={grid(shown)}
            size={STICKER}
            rowGap={4}
            viewport={viewport}
            hint={t('stickers.picker.sendHint')}
            onPress={(k) => {
              const s = byKey.get(k);
              if (s) doSend(s);
            }}
            onLongPress={(k) => setPreview(byKey.get(k) ?? null)}
          />
          {current.id === 'together' ? (
            <View style={{ alignItems: 'center', marginTop: 10 }}>
              <Chip
                label={t('stickers.picker.together.pick')}
                kind="suggestion"
                onPress={() => router.push(stickerRoutes.together(farm))}
              />
            </View>
          ) : null}
        </View>
      </ScrollView>
      {preview ? (
        <Animated.View
          entering={FadeIn.duration(motion.fade.durationMs)}
          exiting={FadeOut.duration(motion.fade.durationMs)}
          style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
        >
          <Press
            onPress={() => setPreview(null)}
            darken={false}
            accessibilityLabel={t('stickers.close')}
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: sc.scrim,
            }}
          >
            <Press
              onPress={() => doSend(preview)}
              darken={false}
              haptic="soft"
              accessibilityLabel={t('stickers.picker.send', {
                caption: draw(preview)['caption'] ?? '',
              })}
            >
              <StickerArt attrs={draw(preview)} size={PREVIEW} />
            </Press>
          </Press>
        </Animated.View>
      ) : null}
    </View>
  );
}
