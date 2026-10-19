import type { FarmId, PersonId } from '@kithfield/contracts';
import type { FarmView } from '@kithfield/farm';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { rhythmColours } from '@kithfield/theme';

import { useFarm, useFarmView, useOpenFarm, useSend } from '../../data';
import { LayeredScene } from '../../ui/art/layered-scene';
import { TextField } from '../../ui/components/text-field';
import { useToast } from '../../ui/components/toast';
import { useLocale } from '../../ui/locale/locale-provider';
import { haptics } from '../../ui/motion/haptics';
import { useSession } from '../../ui/session/session';
import { useTheme } from '../../ui/theme/theme-provider';
import { Txt } from '../../ui/type/text';
import { listOf, nameOf } from '../farm/farm-copy';
import { NightVeil, Panel } from '../farm/panel';
import { useNow } from '../farm/use-now';
import { birthdayBloom } from './birthday';
import { ActionButton, Faces, TitlePill, TopBar } from './chrome';
import { refusalCopy } from './copy';

const W = 393;

/** Petals fall for six seconds as the bloom opens, then for six seconds every thirty. */
const FALL_MS = 6_000;
const EVERY_MS = 30_000;

function usePetalsFalling(): boolean {
  const [falling, setFalling] = useState(true);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const cycle = (on: boolean) => {
      setFalling(on);
      timer = setTimeout(() => cycle(!on), on ? FALL_MS : EVERY_MS - FALL_MS);
    };
    cycle(true);
    return () => clearTimeout(timer);
  }, []);
  return falling;
}

/** A birthday bloom over a member's cottage: water it, or sign their card. */
export function BirthdayScreen({
  farm,
  person,
}: {
  readonly farm: FarmId;
  readonly person: PersonId;
}) {
  const { t } = useLocale();
  const { palette, appearance } = useTheme();
  const colours = rhythmColours[appearance];
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const k = width / W;
  const now = useNow();
  useOpenFarm(farm);
  const state = useFarm(farm)?.state ?? null;
  const view = useFarmView<FarmView>(farm, now);
  const me = useSession().person?.id ?? null;
  const send = useSend(farm);
  const toast = useToast();
  const falling = usePetalsFalling();
  const [writing, setWriting] = useState(false);
  const [words, setWords] = useState('');

  const bloom = state && view ? birthdayBloom(state, view, person, me) : null;
  const name = bloom?.name ?? t('rhythm.someone');
  const petals = bloom?.petals ?? [];
  const critters = petals.flatMap((p) => {
    const m = state?.members.find((x) => x.person === p);
    return m ? [m.critter] : [];
  });

  const water = async () => {
    haptics.soft();
    const sent = await send('dewdrop', { to: person });
    if (sent.status === 'refused') toast.show(refusalCopy(t, sent.reason));
  };
  const sign = async () => {
    const text = words.trim();
    if (!text) return;
    haptics.soft();
    const sent = await send('card_signed', { to: person, text });
    if (sent.status === 'queued') {
      setWriting(false);
      setWords('');
    } else toast.show(refusalCopy(t, sent.reason));
  };

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <View style={{ position: 'absolute', top: 0, left: 0 }}>
        <LayeredScene
          scene="bloom"
          width={width}
          height={600 * k}
          attrs={{ season: state?.season.season ?? 'spring' }}
          paused={!falling}
        />
        <NightVeil width={width} height={600 * k} />
      </View>
      <TopBar
        top={insets.top - 1}
        onBack={() => router.back()}
        center={
          <TitlePill
            title={bloom?.you ? t('rhythm.birthday.pillYou') : t('rhythm.birthday.pill', { name })}
          />
        }
      />
      {/* Writing on the card lifts the sheet over the bloom, clear of the keyboard. */}
      <Panel top={writing ? insets.top + 64 : 560 * k} style={{ paddingHorizontal: 20 }}>
        <Txt variant="displayM" multiline accessibilityRole="header">
          {bloom?.you ? t('rhythm.birthday.titleYou') : t('rhythm.birthday.title', { name })}
        </Txt>
        {bloom ? (
          <>
            <Txt variant="sheetBody" multiline color={palette.body}>
              {bloom.you ? t('rhythm.birthday.bodyYou') : t('rhythm.birthday.body', { name })}
            </Txt>
            {writing ? (
              <TextField
                label={t('rhythm.birthday.cardLabel', { name })}
                placeholder={t('rhythm.birthday.cardPlaceholder', { name })}
                value={words}
                onChangeText={setWords}
                maxLength={200}
                multiline
                autoFocus
              />
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                {critters.length > 0 ? (
                  <Faces critters={critters.slice(0, 5)} size={28} ring={palette.sheet} />
                ) : null}
                <Txt variant="notice" multiline color={palette.secondary} style={{ flex: 1 }}>
                  {petals.length > 0
                    ? t('rhythm.birthday.petals', {
                        names: listOf(
                          t,
                          petals.map((p) => nameOf(t, state, p)),
                        ),
                      })
                    : t('rhythm.birthday.noPetals')}
                </Txt>
              </View>
            )}
          </>
        ) : state && view ? (
          <Txt variant="sheetBody" multiline color={palette.body}>
            {t('rhythm.birthday.over')}
          </Txt>
        ) : null}
      </Panel>
      {bloom && !bloom.you ? (
        <KeyboardStickyView
          offset={{ opened: 34 - 12 }}
          style={{
            position: 'absolute',
            left: 24,
            right: 24,
            bottom: 34,
            flexDirection: 'row',
            gap: 10,
          }}
        >
          {writing ? (
            <>
              <ActionButton
                label={t('rhythm.birthday.cardCancel')}
                onPress={() => setWriting(false)}
                bg={palette.fillSecondary}
                fg={palette.text}
                small
                style={{ flex: 1 }}
              />
              <ActionButton
                label={t('rhythm.birthday.cardSend')}
                onPress={() => void sign()}
                bg={colours.rose.bg}
                fg={colours.rose.fg}
                disabled={!words.trim()}
                style={{ flex: 1 }}
              />
            </>
          ) : (
            <>
              <ActionButton
                label={bloom.signed ? t('rhythm.birthday.signed') : t('rhythm.birthday.sign')}
                icon="pencil"
                onPress={() => setWriting(true)}
                bg={palette.fillSecondary}
                fg={palette.text}
                small
                disabled={bloom.signed}
                style={{ flex: 1 }}
              />
              <ActionButton
                label={bloom.watered ? t('rhythm.birthday.watered') : t('rhythm.birthday.water')}
                onPress={() => void water()}
                bg={colours.rose.bg}
                fg={colours.rose.fg}
                disabled={bloom.watered}
                style={{ flex: 1 }}
              />
            </>
          )}
        </KeyboardStickyView>
      ) : null}
    </View>
  );
}
