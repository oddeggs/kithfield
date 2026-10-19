import type { FarmId, PersonId } from '@kithfield/contracts';
import type { FarmView } from '@kithfield/farm';
import { radii } from '@kithfield/theme';
import { router } from 'expo-router';
import { getCalendars, getLocales } from 'expo-localization';
import { useState } from 'react';
import { View, useWindowDimensions } from 'react-native';

import { showChoices } from '../../../modules/android-system';

import { useCottage, useDataClient, useFarm, useFarmView } from '../../data';
import { ArtIcon, ArtLoop } from '../../ui/art/art-view';
import { lookOf, sceneLook } from '../../ui/art/critter-look';
import { Button } from '../../ui/components/button';
import { ListGroup, ListRow } from '../../ui/components/list-row';
import { useToast } from '../../ui/components/toast';
import { useLocale } from '../../ui/locale/locale-provider';
import { Press } from '../../ui/motion/press';
import { useSession } from '../../ui/session/session';
import { useTheme } from '../../ui/theme/theme-provider';
import { TravelAnchor, timing, travelIds, useTravel } from '../../ui/travel';
import { Txt } from '../../ui/type/text';
import { WishlistShelf } from '../shop/wishlist-shelf';
import { deviceTimeZone, hemisphereOf } from './calendar';
import { say } from './farm-copy';
import { farmRoutes } from './routes';
import { useNow } from './use-now';
import { typeAt } from './type-at';

/** "March", or "March 2025" for an earlier year. */
export function monthOf(language: string, at: number, now: number): string {
  const sameYear = new Date(at).getFullYear() === new Date(now).getFullYear();
  return new Intl.DateTimeFormat(language, {
    month: 'long',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).format(at);
}

function ActionTile({
  icon,
  label,
  night = false,
  onPress,
}: {
  readonly icon: string;
  readonly label: string;
  readonly night?: boolean;
  readonly onPress: () => void;
}) {
  const { palette } = useTheme();
  return (
    <Press
      onPress={onPress}
      haptic="soft"
      radius={20}
      accessibilityLabel={label}
      style={{
        flex: 1,
        minHeight: 76,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        backgroundColor: night ? palette.firefly.bg : palette.card,
        ...(night ? {} : { borderWidth: 1, borderColor: palette.cardBorder }),
      }}
    >
      <ArtIcon name={icon} size={30} color={palette.text} />
      <Txt
        variant="buttonSmall"
        style={{ fontSize: 12.5 }}
        color={night ? palette.firefly.fg : palette.text}
      >
        {label}
      </Txt>
    </Press>
  );
}

/** The card's own drawing of the critter, which walks off it onto a porch. */
const CARD_STAGE = 'farm:card-stage';
/** How big the critters walking onto the porch are drawn. */
const WALKER = 140;

/** The way the porch draws a critter on a seat (`S.porch`): the hedgehog and sheep face in. */
export const seatFacing = (species: string, seat: number): 'left' | 'right' =>
  (species === 'hedgehog' || species === 'sheep') && seat === 1 ? 'left' : 'right';

/**
 * A critter's card: who they are, how they are, a visit to their porch, the gestures you
 * can leave them, and mute, report or block.
 */
export function CritterCard({
  farm,
  person,
}: {
  readonly farm: FarmId;
  readonly person: PersonId;
}) {
  const { t, language, fontLocale } = useLocale();
  const { palette, appearance } = useTheme();
  const toast = useToast();
  const { width } = useWindowDimensions();
  const now = useNow();
  const state = useFarm(farm)?.state ?? null;
  const view = useFarmView<FarmView>(farm, now);
  const { chats } = useCottage();
  const client = useDataClient();
  const [opening, setOpening] = useState(false);
  const travel = useTravel();
  const me = useSession().person?.id ?? null;
  // The card's top on the window, from its own height: views in a native sheet measure from it.
  const { height: windowH } = useWindowDimensions();
  const [cardH, setCardH] = useState<number | null>(null);
  const member = state?.members.find((m) => m.person === person) ?? null;
  const critter = view?.critters.find((c) => c.person === person) ?? null;
  if (!state || !member) return null;

  const name = member.name ?? t('farm.someone');
  const species = say(t, `farm.species.${member.critter.species}`);
  const how =
    critter?.status ??
    (critter?.hibernating
      ? t('farm.state.hibernating')
      : critter?.paused
        ? t('farm.state.napping')
        : critter?.sleepy
          ? t('farm.state.dozing')
          : t('farm.state.out'));
  const visit = chats.find((c) => c.farmKind === 'visit' && c.with?.person === person);
  const c = member.critter;

  // The card closes as you go, so coming back finds the farm with its tab bar, not the card.
  const toPorch = (porch: FarmId) => {
    if (router.canGoBack()) router.back();
    router.navigate(farmRoutes.chat(porch));
  };
  /**
   * Both critters walk onto the porch as it opens (signature motion): they come off the card, you
   * from the left, and sit on their seats in its header.
   */
  const walkToPorch = async (porch: FarmId) => {
    // The porch seats its owner (whoever opened it first) on the left: each walks to their seat
    // and lands facing the way the porch draws them sitting. They sit down together, as the porch
    // draws the pair once both are seated.
    const held = (await client.replica(porch).catch(() => null))?.getState().state ?? null;
    const first = held?.members[0]?.person ?? me;
    const seatOf = (who: PersonId) => (who === first ? 0 : 1);
    const walk = {
      durationMs: timing('visitStart', 'total'),
      hops: { count: 4, height: 8 },
      arc: -10,
      hideSource: false,
    } as const;
    let gone = false;
    const go = () => {
      if (gone) return;
      gone = true;
      toPorch(porch);
    };
    travel.fly({
      ...walk,
      from: CARD_STAGE,
      to: travelIds.porchSeat(porch, person),
      sprite: {
        critter: c.species,
        look: lookOf(c),
        size: WALKER,
        facing: seatFacing(c.species, seatOf(person)),
      },
      onStart: go,
      onReturned: go,
    });
    const mine = me ? state.members.find((m) => m.person === me) : undefined;
    if (me && mine) {
      travel.fly({
        ...walk,
        from: { x: -WALKER - 20, y: windowH * 0.25, width: WALKER, height: WALKER },
        to: travelIds.porchSeat(porch, me),
        sprite: {
          critter: mine.critter.species,
          look: lookOf(mine.critter),
          size: WALKER,
          facing: seatFacing(mine.critter.species, seatOf(me)),
        },
      });
    }
    setTimeout(go, 250);
  };
  // Their porch: the visit you already share, or one opened (or reopened) for the two of you.
  const openPorch = async () => {
    if (visit) {
      await walkToPorch(visit.farm);
      return;
    }
    if (opening) return;
    setOpening(true);
    try {
      const opened = await client.api.openVisit({
        person,
        timeZone: deviceTimeZone(getCalendars()[0]?.timeZone),
        hemisphere: hemisphereOf(getLocales()[0]?.regionCode),
      });
      await walkToPorch(opened.farm);
    } catch {
      toast.show(t('farm.card.visitFailed'));
    } finally {
      setOpening(false);
    }
  };

  const more = () =>
    showChoices(
      {
        options: [
          t('farm.card.mute'),
          t('farm.card.report', { name }),
          t('farm.card.block', { name }),
          t('farm.card.cancel'),
        ],
        destructiveButtonIndex: 2,
        cancelButtonIndex: 3,
        dark: appearance === 'night',
      },
      (i) => {
        if (i === 0) router.push(farmRoutes.farmSettings(farm));
        if (i === 1) router.push(farmRoutes.report(farm, person));
        if (i === 2) router.push(farmRoutes.block(person));
      },
    );

  return (
    <View
      style={{ flex: 1, paddingHorizontal: 18, paddingTop: 22, gap: 12 }}
      onLayout={(e) => setCardH(e.nativeEvent.layout.height)}
    >
      <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
        <TravelAnchor
          id={CARD_STAGE}
          {...(cardH === null ? {} : { sheetTop: windowH - cardH })}
          style={{
            width: 104,
            height: 110,
            borderRadius: radii.card + 4,
            backgroundColor: palette.segment.track,
            overflow: 'hidden',
          }}
        >
          <ArtLoop
            scene="stage"
            width={104}
            height={110}
            attrs={{
              ...sceneLook(c),
              season: view?.season.season ?? 'spring',
              ...(critter?.sleepy ? { state: 'sleep' } : {}),
            }}
          />
        </TravelAnchor>
        <View style={{ flex: 1, gap: 4 }}>
          <Txt variant="errorTitle" multiline accessibilityRole="header">
            {name}
          </Txt>
          <Txt variant="rowSubtitle" style={{ fontSize: 14 }} color={palette.secondary}>
            {t('farm.card.kind', { species, name })}
          </Txt>
          <Txt
            variant="handS"
            multiline
            style={typeAt('handS', 17, 19, fontLocale)}
            color={palette.go.bg}
          >
            {how}
          </Txt>
        </View>
      </View>
      <Button
        label={t('farm.card.visit', { name })}
        icon="door"
        kind="go"
        onPress={() => void openPorch()}
      />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <ActionTile
          icon="firefly"
          label={t('farm.card.firefly')}
          night
          onPress={() => router.push(farmRoutes.tray(farm, person))}
        />
        <ActionTile
          icon="wave"
          label={t('farm.card.knock')}
          onPress={() => router.push(farmRoutes.tray(farm, person))}
        />
        <ActionTile
          icon="rosette"
          label={t('farm.card.gift')}
          onPress={() => router.push({ pathname: '/shop/gift', params: { farm, to: person } })}
        />
        <ActionTile
          icon="photo"
          label={t('farm.card.photos')}
          onPress={() => router.navigate(farmRoutes.media(farm))}
        />
      </View>
      {/* What they'd love: each wish leads to leaving it on their step. */}
      <WishlistShelf farm={farm} person={person} own={false} width={width - 36} />
      <ListGroup>
        <ListRow
          icon="bell"
          title={t('farm.card.since', { month: monthOf(language, member.joinedAt, now) })}
          subtitle={member.battery === 'resting' ? t('farm.card.resting') : t('farm.card.lampOn')}
        />
        <ListRow
          icon="more"
          title={t('farm.card.more')}
          subtitle={t('farm.card.moreBody')}
          onPress={more}
        />
      </ListGroup>
    </View>
  );
}
