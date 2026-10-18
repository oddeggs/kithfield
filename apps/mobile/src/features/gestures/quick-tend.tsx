import type { FarmState, QuickTendList } from '@kithfield/contracts';
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
import { useTheme } from '../../ui/theme/theme-provider';
import { Txt } from '../../ui/type/text';
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

/**
 * `GET /v1/quick-tend`, once the data layer's API client has it. Until then the screen shows the
 * path washed out and offers to try again.
 */
type QuickTendApi = { quickTend?: () => Promise<QuickTendList> };

const keyOf = (i: QuickTendItem) => `${i.farm}:${i.seq}`;

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
  const waiting = useRef(
    new Map<string, { timer: ReturnType<typeof setTimeout>; go: () => void }>(),
  );

  const load = useCallback(() => {
    setFailed(false);
    const api = client.api as typeof client.api & QuickTendApi;
    if (!api.quickTend) {
      setFailed(true);
      return;
    }
    api.quickTend().then(
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
  }, [items, client]);

  // Leaving sends every answer still in its grace period.
  useEffect(() => {
    const pending = waiting.current;
    return () => {
      for (const w of pending.values()) {
        clearTimeout(w.timer);
        w.go();
      }
      pending.clear();
    };
  }, []);

  const reply = (item: QuickTendItem, r: QuickReply) => {
    const key = keyOf(item);
    const { kind, payload } = writeOf(item, r, t(`gestures.quickTend.reply.${r.words}`));
    const go = () => {
      waiting.current.delete(key);
      void client.send(item.farm, kind, payload).then((result) => {
        if (result.status === 'queued') markOurs(result.opId);
        else toast.show(reject(result.reason));
      });
    };
    waiting.current.set(key, { timer: setTimeout(go, UNDO_MS), go });
    setSent((s) => ({ ...s, [key]: r }));
  };
  const undo = (item: QuickTendItem) => {
    const key = keyOf(item);
    const w = waiting.current.get(key);
    if (!w) return;
    clearTimeout(w.timer);
    waiting.current.delete(key);
    setSent(({ [key]: _gone, ...rest }) => rest);
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
            <QuickTendCard
              key={keyOf(item)}
              item={item}
              who={whoOf(item)}
              sent={sent[keyOf(item)] ?? null}
              onReply={(r) => reply(item, r)}
              onUndo={() => undo(item)}
            />
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
              <ArtLoop scene="bouquet" width={84} height={84} />
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
