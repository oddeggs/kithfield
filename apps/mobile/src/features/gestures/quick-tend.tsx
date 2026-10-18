import type { FarmState, StickerPayload } from '@kithfield/contracts';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDataClient } from '../../data';
import { ArtLoop, ArtStill } from '../../ui/art/art-view';
import { Button } from '../../ui/components/button';
import { EmptyState, ErrorState } from '../../ui/components/state-shell';
import { useToast } from '../../ui/components/toast';
import { useLocale } from '../../ui/locale/locale-provider';
import { Press } from '../../ui/motion/press';
import { useSession } from '../../ui/session/session';
import { useTheme } from '../../ui/theme/theme-provider';
import { timing, TravelAnchor, travelIds, useTravel, type SpriteSpec } from '../../ui/travel';
import { Txt } from '../../ui/type/text';
import { QuickTendStickers, quickStickers, type StickerPerson } from '../stickers';
import { stickersApi } from '../stickers/api';
import { createGrace } from './model/grace';
import { friendOf } from './model/people';
import {
  bouquetParts,
  splitQuickTend,
  writeOf,
  type QuickReply,
  type QuickTendItem,
} from './model/quick-tend';
import { QuickTendCard, UNDO_MS } from './quick-tend-card';
import { routes } from './routes';
import { markOurs, useGestureRejections, useRejectCopy } from './send';
import { useGestureColours } from './ui/colours';

const keyOf = (i: QuickTendItem) => `${i.farm}:${i.seq}`;

/** An answered card rolled into one stem of the bouquet, and where it lands. */
const STEM = 90;
const stemArt: SpriteSpec = {
  scene: 'plant',
  attrs: { name: 'rose', stage: 2, color: 'none' },
  width: STEM,
  height: STEM,
  drawings: 2,
};

/**
 * An answer rolls into a stem and drops into the bouquet; undone, it unrolls back into its card
 * (signature motion). Only while the bouquet shows.
 */
function useStems() {
  const travel = useTravel();
  return (key: string, back: boolean) => {
    if (!travel.has(travelIds.bouquet)) return;
    const card = travelIds.tendCard(key);
    travel.fly({
      from: back ? travelIds.bouquet : card,
      to: back ? card : travelIds.bouquet,
      sprite: stemArt,
      ...(back ? { fromWidth: STEM * 0.6, fit: 0.25 } : { startFit: 0.25, toWidth: STEM * 0.6 }),
      arc: 40,
      fade: 'out',
      hideSource: false,
      hideTarget: false,
      durationMs: timing('bouquet', 'perCard'),
    });
  };
}

/**
 * Quick Tend: after time away, three gentle cards for the friends hoping to hear from you,
 * and the rest folded into one bouquet. An answer goes after a five-second grace, so a second tap
 * takes it back; leaving sends what's still waiting.
 */
export function QuickTendScreen() {
  const { t } = useLocale();
  const { palette } = useTheme();
  const gc = useGestureColours();
  const toast = useToast();
  const reject = useRejectCopy();
  const insets = useSafeAreaInsets();
  const client = useDataClient();
  useGestureRejections();
  const [items, setItems] = useState<QuickTendItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [states, setStates] = useState<Record<string, FarmState | null>>({});
  const [sent, setSent] = useState<Record<string, QuickReply>>({});
  const [stickerSent, setStickerSent] = useState<Record<string, StickerPayload>>({});
  // Who each farm can draw into a together sticker (`GET /v1/farms/:id/together`).
  const [drawable, setDrawable] = useState<Record<string, ReadonlySet<string>>>({});
  const me = useSession().person?.id ?? null;
  const grace = useRef(createGrace(UNDO_MS)).current;
  const stems = useStems();

  const load = useCallback(() => {
    setFailed(false);
    client.api.quickTend().then(
      (list) => setItems(list.items),
      () => setFailed(true),
    );
  }, [client]);
  useEffect(load, [load]);

  // Each farm's members, from what the phone holds, to name and draw who is waiting.
  useEffect(() => {
    if (items === null) return;
    const farms = [...new Set(items.map((i) => i.farm))];
    void Promise.all(
      farms.map(async (f) => [f, (await client.replica(f)).getState().state] as const),
    ).then((found) => setStates(Object.fromEntries(found)));
    const stickers = stickersApi(client.api);
    void Promise.all(
      farms.map(async (f) => {
        const people = await stickers.together(f).then(
          (r) => r.people,
          () => [],
        );
        return [f, new Set(people)] as const;
      }),
    ).then((found) => setDrawable(Object.fromEntries(found)));
  }, [items, client]);

  // Leaving sends every answer still in its grace period.
  useEffect(() => () => grace.flush(), [grace]);

  const reply = (item: QuickTendItem, r: QuickReply) => {
    const key = keyOf(item);
    const { kind, payload } = writeOf(item, r, t(`gestures.quickTend.reply.${r.words}`));
    grace.hold(key, () => {
      void client.send(item.farm, kind, payload).then((result) => {
        if (result.status === 'queued') markOurs(result.opId);
        else toast.show(reject(result.reason));
      });
    });
    setSent((s) => ({ ...s, [key]: r }));
    stems(key, false);
  };
  const undo = (item: QuickTendItem) => {
    const key = keyOf(item);
    if (!grace.undo(key)) return;
    stems(key, true);
    setSent(({ [key]: _gone, ...rest }) => rest);
    setStickerSent(({ [key]: _gone, ...rest }) => rest);
  };
  // A sticker answer goes through the same grace as words.
  const sendSticker = (item: QuickTendItem, sticker: StickerPayload) => {
    const key = keyOf(item);
    grace.hold(key, () => {
      void client.send(item.farm, 'sticker', sticker).then((result) => {
        if (result.status === 'queued') markOurs(result.opId);
        else toast.show(reject(result.reason));
      });
    });
    setStickerSent((s) => ({ ...s, [key]: sticker }));
    stems(key, false);
  };
  const stickerPerson = (farm: string, person: string | null): StickerPerson | null => {
    const m = states[farm]?.members.find((x) => x.person === person);
    return m ? { name: m.name, critter: m.critter } : null;
  };

  const whoOf = (i: QuickTendItem) => friendOf(states[i.farm] ?? null, i.actor);
  const toFarm = () => router.dismissTo('/farm');

  if (failed || items === null || items.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.background, paddingBottom: insets.bottom }}>
        {failed ? (
          <ErrorState
            art={<ArtStill scene="spot" width={300} height={216} attrs={{ name: 'offline' }} />}
            title={t('gestures.quickTend.errorTitle')}
            body={t('gestures.quickTend.errorBody')}
            action={{ label: t('gestures.quickTend.retry'), onPress: load, kind: 'primary' }}
            secondary={{ label: t('gestures.quickTend.toFarm'), onPress: toFarm, kind: 'text' }}
          />
        ) : items !== null ? (
          <EmptyState
            art={<ArtStill scene="spot" width={300} height={216} attrs={{ name: 'done' }} />}
            title={t('gestures.quickTend.emptyTitle')}
            body={t('gestures.quickTend.emptyBody')}
            action={{
              label: t('gestures.quickTend.toFarm'),
              onPress: toFarm,
              icon: 'farm',
              kind: 'primary',
            }}
          />
        ) : null}
      </View>
    );
  }

  const { cards, rest } = splitQuickTend(items);
  const parts = bouquetParts(rest, (i) =>
    i.kind === 'seed_planted' ? (i.name ?? null) : (whoOf(i)?.name ?? i.with?.name ?? null),
  );
  const phrases = parts.map((p) =>
    p.key === 'hellos'
      ? t('gestures.quickTend.bouquet.hellos')
      : t(`gestures.quickTend.bouquet.${p.key}`, { name: p.name }),
  );
  const summary =
    phrases.length === 1
      ? t('gestures.quickTend.bouquet.one', { first: phrases[0] ?? '' })
      : t('gestures.quickTend.bouquet.list', {
          first: phrases.slice(0, -1).join(', '),
          last: phrases.at(-1) ?? '',
        });
  const oldest = rest.at(-1);

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 3, paddingBottom: 120 + insets.bottom }}
      >
        <View style={{ paddingHorizontal: 20, gap: 6 }}>
          <Txt variant="handS" color={palette.go.bg} style={{ fontSize: 18, lineHeight: 19.8 }}>
            {t('gestures.quickTend.eyebrow')}
          </Txt>
          <Txt variant="displayL" accessibilityRole="header" style={{ lineHeight: 37.4 }}>
            {t('gestures.quickTend.title')}
          </Txt>
          <Txt variant="sheetBody" multiline color={palette.body}>
            {t('gestures.quickTend.body')}
          </Txt>
        </View>
        <View style={{ paddingHorizontal: 16, gap: 8, marginTop: 16 }}>
          {cards.map((item) => (
            <TravelAnchor key={keyOf(item)} id={travelIds.tendCard(keyOf(item))}>
              <QuickTendCard
                item={item}
                who={whoOf(item)}
                sent={sent[keyOf(item)] ?? null}
                onReply={(r) => reply(item, r)}
                onUndo={() => undo(item)}
                stickerSent={stickerSent[keyOf(item)] !== undefined}
                stickers={
                  <QuickTendStickers
                    stickers={quickStickers(item, me, drawable[item.farm] ?? new Set())}
                    me={stickerPerson(item.farm, me)}
                    personOf={(p) => stickerPerson(item.farm, p)}
                    replyName={whoOf(item)?.name ?? item.with?.name ?? null}
                    sent={stickerSent[keyOf(item)] ?? null}
                    onSend={(s) => sendSticker(item, s)}
                    onUndo={() => undo(item)}
                    onWrite={() => router.push(routes.chatAt(item.farm, item.seq))}
                  />
                }
              />
            </TravelAnchor>
          ))}
          {rest.length > 0 && oldest ? (
            <Press
              onPress={() => router.push(routes.chatAt(oldest.farm, oldest.seq))}
              radius={26}
              accessibilityLabel={`${t('gestures.quickTend.bouquet')}. ${summary}`}
              style={{
                borderRadius: 26,
                backgroundColor: gc.bouquet,
                paddingVertical: 10,
                paddingLeft: 6,
                paddingRight: 14,
                flexDirection: 'row',
                gap: 6,
                alignItems: 'center',
              }}
            >
              <TravelAnchor id={travelIds.bouquet}>
                <ArtLoop scene="bouquet" width={84} height={84} />
              </TravelAnchor>
              <View style={{ flex: 1, gap: 4 }}>
                <Txt variant="trayTitle" style={{ lineHeight: 19.2 }}>
                  {t('gestures.quickTend.bouquet')}
                </Txt>
                <Txt
                  variant="planDetail"
                  multiline
                  color={palette.plan.detail}
                  style={{ lineHeight: 19.17 }}
                >
                  {summary}
                </Txt>
                <Txt
                  variant="buttonSmall"
                  color={palette.chip.suggestionFg}
                  style={{ marginTop: 2 }}
                >
                  {`${t('gestures.quickTend.readOn')} ›`}
                </Txt>
              </View>
            </Press>
          ) : null}
        </View>
      </ScrollView>
      <View style={{ position: 'absolute', left: 24, right: 24, bottom: 34 }}>
        <Button label={t('gestures.quickTend.toFarm')} kind="primary" onPress={toFarm} />
      </View>
    </View>
  );
}
