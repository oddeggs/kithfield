import type { FarmState, StickerPayload } from '@kithfield/contracts';
import { springs } from '@kithfield/theme';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDataClient, useFarm, useSend } from '../../../data';
import { ArtIcon } from '../../../ui/art/art-view';
import { Button } from '../../../ui/components/button';
import { EmptyState } from '../../../ui/components/state-shell';
import { useToast } from '../../../ui/components/toast';
import { useLocale } from '../../../ui/locale/locale-provider';
import { Press } from '../../../ui/motion/press';
import { useReduceMotion } from '../../../ui/motion/reduce-motion';
import { useTheme } from '../../../ui/theme/theme-provider';
import { useAccessibilitySize } from '../../../ui/type/accessibility-size';
import { Txt } from '../../../ui/type/text';
import { stickersApi } from '../api';
import { rememberTogetherExport } from '../export/together-export';
import { useTogetherPeople } from '../data';
import { OWN } from '../model/catalogue';
import { sceneOfSticker, type StickerPerson } from '../model/look';
import { keepDrawable, togetherOffers, togglePick, type TogetherOffer } from '../model/together';
import { useStickerColours } from '../ui/colours';
import { FaceRow, type Face } from '../ui/face-row';
import { HEADER_BOTTOM, leave, ScreenHeader } from '../ui/header';
import { StickerArt } from '../ui/sticker';
import { useMe } from '../ui/use-me';

const MAIN = 230;
/** Faces hop into the frame 80 ms apart (`08 Stickers`, developer notes): one hop's rise. */
const HOP_MS = 80;
const MORE = 84;

const personFrom =
  (state: FarmState | null) =>
  (person: string): StickerPerson | null => {
    const m = state?.members.find((x) => x.person === person);
    return m ? { name: m.name, critter: m.critter } : null;
  };

/**
 * Together stickers: pick up to four friends from this farm and see you all drawn as everyone
 * looks today. Only friends who can be drawn in show (never someone blocked or removed, never
 * someone who turned it off). Sends the big one to the farm; with `ask`, asks everyone in it for
 * their OK to take it out of Kithfield instead.
 */
export function TogetherScreen({
  farm,
  ask = false,
}: {
  readonly farm: string;
  readonly ask?: boolean;
}) {
  const { t } = useLocale();
  const { palette } = useTheme();
  const sc = useStickerColours();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const ax = useAccessibilitySize();
  const reduce = useReduceMotion();
  const client = useDataClient();
  const state = useFarm(farm)?.state ?? null;
  const send = useSend(farm);
  const me = useMe();
  const drawable = useTogetherPeople(farm);
  const personOf = useMemo(() => personFrom(state), [state]);

  const faces: Face[] = useMemo(() => {
    const ok = new Set(drawable ?? []);
    return [...(state?.members ?? [])]
      .filter((m) => m.person !== me.person && ok.has(m.person))
      .sort((a, b) => a.joinedAt - b.joinedAt)
      .map((m) => ({
        person: m.person,
        name: m.name ?? t('stickers.someone'),
        critter: m.critter,
      }));
  }, [state, drawable, me.person, t]);

  const [picked, setPicked] = useState<string[]>([]);
  const [chosen, setChosen] = useState<string | null>(null);
  useEffect(() => {
    const ok = new Set(faces.map((f) => f.person));
    setPicked((p) => {
      const kept = keepDrawable(p, ok);
      return kept.length > 0 ? kept : faces.slice(0, 1).map((f) => f.person);
    });
  }, [faces]);

  const myMember = state?.members.find((m) => m.person === me.person) ?? null;
  const sender: StickerPerson | null = myMember
    ? { name: myMember.name, critter: myMember.critter }
    : me.critter
      ? { name: me.name, critter: me.critter }
      : null;

  const { main, more } = togetherOffers(picked);
  const all = [main, ...more].filter((o): o is TogetherOffer => o !== null);
  const big = all.find((o) => o.def.id === chosen) ?? main;
  const smalls = all.filter((o) => o !== big).slice(0, 4);
  const payloadOf = (o: TogetherOffer): StickerPayload => ({
    pack: OWN,
    sticker: o.def.id,
    with: [...o.with],
  });
  const attrsOf = (o: TogetherOffer) => sceneOfSticker(t, payloadOf(o), sender, personOf);

  // The friends hop into the frame when the picks change.
  const hop = useSharedValue(0);
  useEffect(() => {
    if (reduce) return;
    hop.set(withSequence(withTiming(-10, { duration: HOP_MS }), withSpring(0, springs.sheet)));
  }, [picked, chosen, hop, reduce]);
  const hopStyle = useAnimatedStyle(() => ({ transform: [{ translateY: hop.get() }] }));

  const names = picked.map((p) => personOf(p)?.name ?? t('stickers.someone'));
  const namesText = names.join(t('stickers.together.and'));
  const farmName = state?.name ?? names[0] ?? '';

  const onSend = () => {
    if (!big) return;
    if (ask) {
      void stickersApi(client.api)
        .askToExport({ farm, people: [...big.with] })
        .then(
          async (r) => {
            // Remembered either way: it goes into the Messages drawer once everyone says OK.
            if (me.person) {
              await rememberTogetherExport(me.person, {
                farm,
                sticker: big.def.id,
                with: [...big.with],
              });
            }
            toast.show(
              big.with.every((p) => r.ok.includes(p))
                ? t('stickers.ask.ready')
                : t('stickers.ask.waiting'),
            );
            leave();
          },
          () => toast.show(t('stickers.adding.failed')),
        );
      return;
    }
    void send('sticker', payloadOf(big)).then((result) => {
      if (result.status !== 'queued') toast.show(t('stickers.picker.refused'));
      // Back to the chat it was sent to, past the picker if it came from there.
      else if (router.canDismiss()) router.dismissAll();
      else leave();
    });
  };

  if (drawable !== null && faces.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.background }}>
        <ScreenHeader title={t('stickers.together.title')} />
        <EmptyState
          art={
            <StickerArt
              attrs={sceneOfSticker(t, { pack: OWN, sticker: 'peek' }, sender, personOf)}
              size={160}
            />
          }
          title={t('stickers.together.title')}
          body={t('stickers.together.empty')}
          action={{ label: t('stickers.back'), onPress: leave, kind: 'primary' }}
        />
      </View>
    );
  }

  // At the accessibility sizes the blocks the design places on the screen stack in one column
  // that scrolls, under the header.
  const at = (place: { top: number; left: number; right: number }) =>
    ax ? { marginHorizontal: place.left } : ({ position: 'absolute', ...place } as const);
  const blocks = (
    <>
      <View style={[at({ top: insets.top + 57, left: 20, right: 20 }), { gap: 12 }]}>
        <FaceRow
          faces={faces}
          picked={picked}
          onToggle={(p) => {
            setChosen(null);
            setPicked((cur) => togglePick(cur, p));
          }}
          labelOf={(f, on) =>
            on
              ? t('stickers.together.friend', { name: f.name })
              : t('stickers.together.friendOff', { name: f.name })
          }
        />
        <Txt variant="body" multiline align="center" color={palette.body}>
          {t('stickers.together.lead', { names: namesText })}
        </Txt>
      </View>
      {big ? (
        <Animated.View
          style={[
            at({ top: insets.top + 177, left: 0, right: 0 }),
            { alignItems: 'center' },
            hopStyle,
          ]}
        >
          <StickerArt attrs={attrsOf(big)} size={MAIN} />
        </Animated.View>
      ) : null}
      <View style={[at({ top: insets.top + 419, left: 16, right: 16 }), { flexDirection: 'row' }]}>
        {smalls.map((o) => (
          <View key={o.def.id} style={{ flex: 1, alignItems: 'center' }}>
            <Press
              onPress={() => setChosen(o.def.id)}
              haptic="select"
              darken={false}
              accessibilityLabel={attrsOf(o)['caption'] ?? ''}
            >
              <StickerArt attrs={attrsOf(o)} size={MORE} />
            </Press>
          </View>
        ))}
      </View>
      <View
        style={{
          ...at({ top: insets.top + 531, left: 20, right: 20 }),
          borderRadius: 22,
          backgroundColor: palette.card,
          borderWidth: 1,
          borderColor: palette.cardBorder,
          paddingVertical: 12,
          paddingHorizontal: 14,
          flexDirection: 'row',
          gap: 10,
          alignItems: 'center',
        }}
      >
        <ArtIcon name="sparkle" size={26} color={palette.go.bg} />
        <Txt variant="notice" multiline color={sc.noteText} style={{ flex: 1 }}>
          {t('stickers.together.note', { name: names[0] ?? '' })}
        </Txt>
      </View>
    </>
  );
  const sendButton = (
    <Button
      label={ask ? t('stickers.ask.send') : t('stickers.together.send', { farm: farmName })}
      kind="primary"
      disabled={!big}
      onPress={onSend}
    />
  );
  if (ax) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.background }}>
        <ScreenHeader title={t('stickers.together.title')} />
        <ScrollView
          // Below the header, so nothing scrolls under its back button.
          style={{ marginTop: insets.top + HEADER_BOTTOM }}
          contentContainerStyle={{
            paddingTop: 57 - HEADER_BOTTOM,
            paddingBottom: insets.bottom + 16,
            gap: 20,
          }}
        >
          {blocks}
          <View style={{ marginHorizontal: 24 }}>{sendButton}</View>
        </ScrollView>
      </View>
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <ScreenHeader title={t('stickers.together.title')} />
      {blocks}
      <View style={{ position: 'absolute', left: 24, right: 24, bottom: insets.bottom + 0 }}>
        {sendButton}
      </View>
    </View>
  );
}
