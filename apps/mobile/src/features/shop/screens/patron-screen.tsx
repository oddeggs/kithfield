import type { CritterVote, FarmId, FarmList } from '@kithfield/contracts';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { useDataClient } from '../../../data/react';
import { ArtStill } from '../../../ui/art/art-view';
import { useToast } from '../../../ui/components/toast';
import { useLocale } from '../../../ui/locale/locale-provider';
import { Press } from '../../../ui/motion/press';
import { useTheme } from '../../../ui/theme/theme-provider';
import { itemName } from '../copy';
import { useShop } from '../data/shop-data';
import { useMyWallName } from '../data/wall-name';
import { monthName, orList } from '../format';
import { Eyebrow, Title } from '../kit/bits';
import { useInks } from '../kit/inks';
import { ShopFailed } from '../kit/states';
import { ScreenLoading } from '../kit/screen-loading';
import { Header, HeroSheet, useDesignTop } from '../kit/layout';
import { LanternGlow, PerkRow, patronHero } from '../kit/patron-bits';
import { currentSeason } from '../kit/season';
import { SText } from '../kit/text';
import { planLine, voteName } from '../patron-plan';

/**
 * A patron's own view: thanks, this month's parcel, the vote, their name on the wall and the
 * wardrobe, then their plan. A Farm Plus payer also chooses the farm it covers here.
 */
export function PatronScreen() {
  const { t, language } = useLocale();
  const inks = useInks();
  const shop = useShop();
  const { width } = useWindowDimensions();
  const top = useDesignTop();
  const wall = useMyWallName();
  const [vote, setVote] = useState<CritterVote | null | 'none'>(null);
  const { api, entitlements, collection, me } = shop;

  useEffect(() => {
    let live = true;
    api.vote().then(
      (v) => live && setVote(v),
      () => live && setVote('none'),
    );
    return () => {
      live = false;
    };
  }, [api]);

  const parcel = useMemo(
    () =>
      [...(collection?.items ?? [])]
        .filter((i) => i.via === 'parcel')
        .sort((a, b) => b.at - a.at)[0] ?? null,
    [collection],
  );
  const patronage = entitlements?.patronage ?? null;
  const hero = patronHero(me?.critter);
  const voteLine =
    vote === null || vote === 'none'
      ? t('shop.member.voteNone')
      : t('shop.vote.question', {
          options: orList(
            vote.options.map((o, i) => {
              const name = voteName(t, o);
              return i === 0 ? name : name.toLocaleLowerCase();
            }),
            (rest, last) => t('shop.vote.or', { rest, last }),
          ),
        });
  const wallLine =
    wall.name === null
      ? t('shop.member.wallAdd')
      : wall.before !== null && wall.after !== null
        ? t('shop.member.wallBetween', { before: wall.before, after: wall.after })
        : wall.before === null && wall.after !== null
          ? t('shop.member.wallFirst')
          : t('shop.member.wallOn', { name: wall.name });

  // Nothing about your patronage is guessed: a quiet line while it comes, Try again if it can't.
  if (shop.failed) return <ShopFailed onRetry={shop.reload} />;
  if (shop.loading) return <ScreenLoading />;

  return (
    <HeroSheet
      artHeight={280}
      sheetTop={250}
      art={
        <View style={{ width, height: top(280) }}>
          <ArtStill
            scene="style"
            width={width}
            height={top(280)}
            t={1.2}
            attrs={{
              name: hero.cottage,
              night: 'true',
              season: currentSeason(),
              ...(hero.species ? { kind: hero.species } : {}),
            }}
          />
          <LanternGlow
            width={(120 / 393) * width}
            height={90}
            style={{ left: (140 / 393) * width, top: top(90) }}
          />
        </View>
      }
      header={<Header />}
    >
      {patronage ? (
        <Eyebrow
          text={t('shop.member.since', { month: monthName(language, patronage.since) })}
          tone="honey"
        />
      ) : null}
      <Title
        text={me?.name ? t('shop.member.thanks', { name: me.name }) : t('shop.member.thanksYou')}
      />
      <View>
        <PerkRow
          icon="envelope"
          title={
            parcel
              ? t('shop.member.parcel', { month: monthName(language, parcel.at) })
              : t('shop.member.parcelNone')
          }
          sub={parcel ? itemName(t, parcel.item) : t('shop.member.parcelSoon')}
          {...(parcel ? { onPress: () => router.push('/shop/collection') } : {})}
        />
        <PerkRow
          icon="people"
          title={t('shop.member.vote')}
          sub={voteLine}
          onPress={() => router.push('/shop/wall')}
        />
        <PerkRow
          icon="note"
          title={t('shop.member.wall')}
          sub={wallLine}
          onPress={() => router.push('/shop/wall')}
        />
        {entitlements?.farmPlus ? <FarmPlusRow /> : null}
        <PerkRow
          icon="sparkle"
          title={t('shop.member.wardrobe')}
          sub={t('shop.member.wardrobeBody')}
          onPress={() => router.navigate('/shop')}
        />
      </View>
      {patronage ? (
        <Press
          onPress={() => router.push('/shop/manage')}
          darken={false}
          accessibilityRole="button"
          accessibilityLabel={planLine(t, language, patronage)}
          style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}
        >
          <SText s={15} lh={1.2} w={600} multiline style={{ flex: 1 }}>
            {planLine(t, language, patronage)}
          </SText>
          <SText s={15} lh={1.2} w={600} color={inks.chevron}>
            ›
          </SText>
        </Press>
      ) : null}
    </HeroSheet>
  );
}

/** The Farm Plus payer's farm: shown, and chosen from a list of their farms when tapped. */
function FarmPlusRow() {
  const { t } = useLocale();
  const inks = useInks();
  const { palette } = useTheme();
  const toast = useToast();
  const shop = useShop();
  const { api: client } = useDataClient();
  const [farms, setFarms] = useState<FarmList['farms'] | null>(null);
  const [open, setOpen] = useState(false);
  const chosen = shop.entitlements?.farmPlus?.farm ?? null;

  useEffect(() => {
    let live = true;
    client.farms().then(
      (list) => live && setFarms(list.farms.filter((f) => f.kind === 'farm')),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [client]);

  const name = farms?.find((f) => f.farm === chosen)?.name ?? null;
  const choose = async (farm: FarmId) => {
    try {
      await shop.api.chooseFarmPlus(farm);
      shop.setEntitlements(await shop.api.entitlements());
      setOpen(false);
    } catch {
      toast.show(t('shop.failed'));
    }
  };

  return (
    <View>
      <PerkRow
        icon="people"
        title={t('shop.member.farmPlus')}
        sub={name ?? t('shop.member.farmPlusPick')}
        onPress={() => setOpen((o) => !o)}
      />
      {open ? (
        <View style={{ paddingVertical: 8, gap: 6 }}>
          <SText s={13} lh={1.3} multiline color={inks.body}>
            {t('shop.member.chooseBody')}
          </SText>
          {(farms ?? []).map((f) => (
            <Press
              key={f.farm}
              onPress={() => void choose(f.farm)}
              haptic="select"
              radius={14}
              accessibilityRole="radio"
              accessibilityState={{ selected: f.farm === chosen }}
              accessibilityLabel={f.name ?? t('shop.member.choose')}
              style={{
                paddingVertical: 12,
                paddingHorizontal: 14,
                borderRadius: 14,
                backgroundColor: f.farm === chosen ? inks.chosen.bg : inks.tile,
                borderWidth: 1,
                borderColor: f.farm === chosen ? inks.chosen.border : palette.hairline,
              }}
            >
              <SText s={15} w={600}>
                {f.name ?? ''}
              </SText>
            </Press>
          ))}
        </View>
      ) : null}
    </View>
  );
}
