import type { CritterVote } from '@kithfield/contracts';
import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, useWindowDimensions, View } from 'react-native';

import { ApiError } from '../../../data';
import { TextField } from '../../../ui/components/text-field';
import { useToast } from '../../../ui/components/toast';
import { useLocale } from '../../../ui/locale/locale-provider';
import { Press } from '../../../ui/motion/press';
import { useTheme } from '../../../ui/theme/theme-provider';
import { useShop } from '../data/shop-data';
import { rememberWallName, useMyWallName } from '../data/wall-name';
import { Pill } from '../kit/bits';
import { useInks } from '../kit/inks';
import { Header, HeroSheet, useDesignTop } from '../kit/layout';
import { CapsLabel } from '../kit/patron-bits';
import { SText } from '../kit/text';
import { voteName } from '../patron-plan';

type VoteState = CritterVote | 'patrons_only' | 'none' | null;

/**
 * The farmers' wall (every patron's chosen name, kept after they stop) and this season's vote on
 * who moves in next. The vote never shows tallies: only your own choice is marked.
 */
export function WallScreen() {
  const { t, language } = useLocale();
  const { palette } = useTheme();
  const inks = useInks();
  const toast = useToast();
  const shop = useShop();
  const mine = useMyWallName();
  const { width } = useWindowDimensions();
  const top = useDesignTop();
  const [names, setNames] = useState<readonly string[]>([]);
  const [others, setOthers] = useState(0);
  const [next, setNext] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [vote, setVote] = useState<VoteState>(null);
  const [draft, setDraft] = useState('');
  const [own, setOwn] = useState<string | null>(null);
  const { api } = shop;

  useEffect(() => {
    if (mine.wall === null) return;
    setNames(mine.wall.names);
    setOthers(mine.wall.others);
    setNext(mine.wall.next);
  }, [mine.wall]);
  useEffect(() => setOwn(mine.name), [mine.name]);

  useEffect(() => {
    let live = true;
    api.vote().then(
      (v) => live && setVote(v),
      (error: unknown) =>
        live &&
        setVote(error instanceof ApiError && error.status === 403 ? 'patrons_only' : 'none'),
    );
    return () => {
      live = false;
    };
  }, [api]);

  const more = () => {
    if (next === null || loadingMore) return;
    setLoadingMore(true);
    api.wall(next).then(
      (page) => {
        setNames((n) => [...n, ...page.names]);
        setOthers(page.others);
        setNext(page.next);
        setLoadingMore(false);
      },
      () => setLoadingMore(false),
    );
  };

  const cast = async (option: string) => {
    if (vote === null || typeof vote === 'string') return;
    const before = vote;
    setVote({ ...vote, mine: option });
    try {
      await api.castVote(option);
    } catch {
      setVote(before);
      toast.show(t('shop.failed'));
    }
  };

  const putUp = async (name: string | null) => {
    try {
      await api.setWallName(name);
      rememberWallName(shop.person, name);
      setOwn(name);
      setDraft('');
      setNames((list) => {
        const without = list.filter((n) => n !== own);
        return name === null
          ? without
          : [...without, name].sort((a, b) =>
              a.localeCompare(b, undefined, { sensitivity: 'base' }),
            );
      });
    } catch {
      toast.show(t('shop.failed'));
    }
  };

  const everPatron = shop.entitlements?.patronage != null;
  const cardHeight = 196;

  return (
    <HeroSheet
      artHeight={330}
      sheetTop={340}
      art={
        <View style={{ width, height: top(330), backgroundColor: inks.cork }}>
          <Cork width={width} height={top(330)} />
          <View
            accessibilityLabel={t('shop.wall.label')}
            style={{
              position: 'absolute',
              top: top(112),
              left: 18,
              right: 18,
              height: cardHeight,
              borderRadius: 14,
              backgroundColor: inks.wallCard,
              boxShadow: inks.cardShadow,
              overflow: 'hidden',
            }}
          >
            <ScrollView
              contentContainerStyle={{
                padding: 14,
                flexDirection: 'row',
                flexWrap: 'wrap',
                rowGap: 6,
                columnGap: 12,
              }}
              showsVerticalScrollIndicator={false}
              scrollEventThrottle={64}
              onScroll={({ nativeEvent: e }) => {
                if (e.contentOffset.y + e.layoutMeasurement.height > e.contentSize.height - 40)
                  more();
              }}
            >
              {names.map((name, i) => {
                const mineHere = name === own;
                return (
                  <View
                    key={`${name}-${i}`}
                    style={
                      mineHere
                        ? {
                            backgroundColor: inks.wallMine.bg,
                            paddingHorizontal: 6,
                            borderRadius: 6,
                          }
                        : null
                    }
                  >
                    <SText
                      f="hand"
                      s={15}
                      lh={1.2}
                      color={mineHere ? inks.wallMine.fg : inks.wallName}
                    >
                      {name}
                    </SText>
                  </View>
                );
              })}
              {others > 0 ? (
                <SText f="hand" s={15} lh={1.2} color={inks.wallMore}>
                  {t('shop.wall.more', {
                    others: others.toLocaleString(language === 'vi' ? 'vi-VN' : 'en-GB'),
                  })}
                </SText>
              ) : null}
            </ScrollView>
          </View>
        </View>
      }
      header={<Header />}
    >
      <SText f="serif" s={24} lh={1.12} accessibilityRole="header">
        {t('shop.vote.title')}
      </SText>
      <SText s={14.5} lh={1.45} multiline color={palette.body}>
        {t('shop.vote.body')}
      </SText>
      {vote === 'patrons_only' ? (
        <SText s={14.5} lh={1.45} multiline color={inks.body}>
          {t('shop.vote.patronsOnly')}
        </SText>
      ) : vote === 'none' ? (
        <SText s={14.5} lh={1.45} multiline color={inks.body}>
          {t('shop.member.voteNone')}
        </SText>
      ) : vote !== null ? (
        <View style={{ gap: 12 }}>
          {vote.options.map((option) => (
            <VoteRow
              key={option}
              name={voteName(t, option)}
              mine={vote.mine === option}
              onPress={() => void cast(option)}
            />
          ))}
        </View>
      ) : null}
      {everPatron ? (
        <View style={{ gap: 8, marginTop: 8 }}>
          <CapsLabel text={t('shop.wall.edit')} />
          <SText s={13} lh={1.4} multiline color={inks.body}>
            {t('shop.wall.editBody')}
          </SText>
          <TextField
            value={draft}
            onChangeText={setDraft}
            placeholder={own ?? t('shop.wall.field')}
            accessibilityLabel={t('shop.wall.field')}
            maxLength={32}
            autoCorrect={false}
            returnKeyType="done"
          />
          <Pill
            label={t('shop.wall.save')}
            kind="ink"
            disabled={draft.trim() === ''}
            onPress={() => void putUp(draft.trim())}
          />
          {own !== null ? (
            <Press
              onPress={() => void putUp(null)}
              darken={false}
              accessibilityRole="button"
              accessibilityLabel={t('shop.wall.remove')}
              style={{ alignSelf: 'center', paddingVertical: 6 }}
            >
              <SText s={14} w={600} color={inks.body}>
                {t('shop.wall.remove')}
              </SText>
            </Press>
          ) : null}
        </View>
      ) : null}
    </HeroSheet>
  );
}

/** One option of the vote: its name, "your vote" on yours, and a bar filled only for yours. */
function VoteRow({
  name,
  mine,
  onPress,
}: {
  readonly name: string;
  readonly mine: boolean;
  readonly onPress: () => void;
}) {
  const { t } = useLocale();
  const inks = useInks();
  return (
    <Press
      onPress={onPress}
      haptic="select"
      darken={false}
      accessibilityRole="radio"
      accessibilityState={{ selected: mine }}
      accessibilityLabel={name}
      style={{ gap: 5, paddingVertical: 4 }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <SText s={15} w={600}>
          {name}
        </SText>
        {mine ? (
          <SText s={12} w={600} color={inks.fillMoss}>
            {t('shop.vote.yours')}
          </SText>
        ) : null}
      </View>
      <View style={{ height: 10, borderRadius: 5, backgroundColor: inks.barTrack }}>
        {mine ? (
          <View style={{ height: 10, borderRadius: 5, backgroundColor: inks.fillMoss }} />
        ) : null}
      </View>
    </Press>
  );
}

/** The cork board's dots, 7 points apart, drawn once as one path. */
function Cork({ width, height }: { readonly width: number; readonly height: number }) {
  const inks = useInks();
  const dots = useMemo(() => {
    const builder = Skia.PathBuilder.Make();
    for (let y = 3.5; y < height; y += 7) {
      for (let x = 3.5; x < width; x += 7) builder.addCircle(x, y, 1.1);
    }
    return builder.detach();
  }, [width, height]);
  return (
    <Canvas style={{ position: 'absolute', width, height }} pointerEvents="none">
      <Path path={dots} color={inks.corkDot} />
    </Canvas>
  );
}
