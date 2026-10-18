import { farmView } from '@kithfield/farm';
import { day } from '@kithfield/theme';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDataClient } from '../../data';
import { ArtIcon } from '../../ui/art/art-view';
import { Avatar } from '../../ui/art/avatar';
import { useToast } from '../../ui/components/toast';
import { useLocale } from '../../ui/locale/locale-provider';
import { Press } from '../../ui/motion/press';
import { useTheme } from '../../ui/theme/theme-provider';
import { Txt } from '../../ui/type/text';
import { ForwardRow, type FarmGlance, type FarmRow } from './forward-row';
import { FORWARD_LIMIT, forwardWrite, togglePick } from './model/forward';
import { shownText } from './model/message';
import { markOurs, useGestureRejections, useRejectCopy } from './send';
import { leave } from './ui/presentation';
import { seqParam, useGestureFarm } from './use-gesture-farm';

/** Joins place names: "Book Club", "Book Club and Otis", "Book Club, Yuzu and Otis". */
function joinPlaces(
  names: readonly string[],
  and: (first: string, last: string) => string,
): string {
  if (names.length <= 1) return names[0] ?? '';
  return and(names.slice(0, -1).join(', '), names.at(-1) ?? '');
}

/**
 * Forwarding: pass a message to up to five farms and visits. Each gets the same kind of
 * write carrying `forwardedFrom`, and the person who wrote it sees one quiet note naming where it
 * went (never for visits).
 */
export function ForwardScreen() {
  const { t } = useLocale();
  const { palette } = useTheme();
  const toast = useToast();
  const reject = useRejectCopy();
  const insets = useSafeAreaInsets();
  const client = useDataClient();
  const params = useLocalSearchParams<{ seq?: string }>();
  const seq = seqParam(params.seq) ?? 0;
  const g = useGestureFarm();
  useGestureRejections();
  const [rows, setRows] = useState<FarmRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [glances, setGlances] = useState<Record<string, FarmGlance>>({});
  const [picked, setPicked] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let live = true;
    client.api.farms().then(
      (list) => live && setRows(list.farms.filter((f) => f.farm !== g.farm)),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [client, g.farm]);

  // What the phone already holds of each farm: how many critters live there, whether it dozes.
  useEffect(() => {
    if (rows === null) return;
    let live = true;
    void Promise.all(
      rows
        .filter((r) => r.kind === 'farm')
        .map(async (r) => {
          const state = (await client.replica(r.farm)).getState().state;
          if (state === null) return null;
          const view = farmView(state, Date.now());
          return [
            r.farm,
            { critters: state.members.length, dozing: view.misty, season: state.season.season },
          ] as const;
        }),
    ).then((found) => {
      if (live) setGlances(Object.fromEntries(found.filter((f) => f !== null)));
    });
    return () => {
      live = false;
    };
  }, [rows, client]);

  const event = g.events.find((e) => e.seq === seq) ?? null;
  const from = g.friend(event?.actor ?? null);
  const me = g.friend(g.me);
  const text = event ? shownText(event, g.events) : null;
  const nameOf = (r: FarmRow) =>
    r.kind === 'visit' ? (r.with?.name ?? t('gestures.aFriend')) : (r.name ?? '');
  const and = (first: string, last: string) => t('gestures.forward.and', { first, last });
  const pickedRows = (rows ?? []).filter((r) => picked.includes(r.farm));
  const farmsPicked = pickedRows.filter((r) => r.kind === 'farm').map(nameOf);
  const shown = (rows ?? []).filter((r) =>
    nameOf(r).toLowerCase().includes(query.trim().toLowerCase()),
  );
  const showNote =
    event !== null && event.actor !== g.me && g.state?.kind !== 'visit' && farmsPicked.length > 0;

  const toggle = (farm: string) => {
    const next = togglePick(picked, farm);
    if (next.length === picked.length && !picked.includes(farm))
      toast.show(t('gestures.forward.limit'));
    setPicked(next);
  };

  const sendAll = async () => {
    if (!event || picked.length === 0 || sending) return;
    const write = forwardWrite(event, { farm: g.farm, text });
    if (!write) return;
    setSending(true);
    const reached: string[] = [];
    for (const row of pickedRows) {
      const result = await client.send(row.farm, write.kind, write.payload);
      if (result.status === 'queued') {
        markOurs(result.opId);
        reached.push(nameOf(row));
      } else {
        toast.show(reject(result.reason));
      }
    }
    setSending(false);
    if (reached.length > 0) {
      toast.show(t('gestures.sent.forward', { places: joinPlaces(reached, and) }), 'share');
      leave();
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <View
        style={{
          position: 'absolute',
          top: insets.top - 1,
          left: 16,
          right: 16,
          height: 44,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          zIndex: 12,
        }}
      >
        <Press
          onPress={leave}
          radius={22}
          accessibilityLabel={t('gestures.close')}
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: palette.fillSoft,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Txt variant="displayS" style={{ fontSize: 24, lineHeight: 24 }}>
            ✕
          </Txt>
        </Press>
        <Txt
          variant="rowTitle"
          accessibilityRole="header"
          style={{ fontSize: 17, lineHeight: 20.4 }}
        >
          {t('gestures.forward.title')}
        </Txt>
        <Press
          onPress={() => void sendAll()}
          disabled={picked.length === 0 || sending || !event}
          darken={false}
          hitSlop={12}
          accessibilityLabel={t('gestures.forward.send')}
        >
          <Txt
            variant="rowTitle"
            color={picked.length === 0 ? palette.placeholder : palette.go.bg}
            style={{ lineHeight: 16 }}
          >
            {t('gestures.forward.send')}
          </Txt>
        </Press>
      </View>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingTop: insets.top + 53,
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 24,
          gap: 12,
        }}
      >
        {event ? (
          <View
            style={{
              borderRadius: 18,
              backgroundColor: palette.card,
              borderWidth: 1,
              borderColor: palette.cardBorder,
              padding: 12,
              flexDirection: 'row',
              gap: 10,
            }}
          >
            <Avatar kind={from?.kind ?? 'rabbit'} look={from?.look ?? {}} size={30} />
            <View style={{ flex: 1 }}>
              <Txt
                variant="bubbleName"
                color={palette.muted}
                style={{ fontSize: 12.5, lineHeight: 12.5 }}
              >
                {t('gestures.forward.from', {
                  name: from?.name ?? t('gestures.aFriend'),
                  farm: g.state?.name ?? from?.name ?? '',
                })}
              </Txt>
              <Txt variant="bubble" multiline style={{ marginTop: 4 }}>
                {text ?? t('gestures.quickTend.preview.other')}
              </Txt>
            </View>
          </View>
        ) : null}
        {showNote ? (
          <View
            style={{
              flexDirection: 'row',
              gap: 10,
              alignItems: 'center',
              paddingVertical: 10,
              paddingHorizontal: 12,
              borderRadius: 14,
              backgroundColor:
                palette.appearance === 'day' ? day.mossTint : palette.chip.suggestionBg,
            }}
          >
            <ArtIcon name="people" size={20} color={palette.chip.suggestionFg} />
            <Txt
              variant="notice"
              multiline
              color={palette.appearance === 'day' ? '#3f4d33' : palette.body}
              style={{ flex: 1 }}
            >
              {t('gestures.forward.note', {
                name: from?.name ?? t('gestures.aFriend'),
                me: me?.name ?? t('gestures.you'),
                places: joinPlaces(farmsPicked, and),
              })}
            </Txt>
          </View>
        ) : null}
        <View
          style={{
            minHeight: 54,
            borderRadius: 16,
            backgroundColor: palette.card,
            borderWidth: 1,
            borderColor: palette.cardBorder,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            paddingHorizontal: 16,
          }}
        >
          <ArtIcon name="search" size={16} color={palette.placeholder} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('gestures.forward.search')}
            placeholderTextColor={palette.placeholder}
            selectionColor={palette.go.bg}
            style={{ flex: 1, fontSize: 15, color: palette.text, minHeight: 44 }}
          />
        </View>
        <View>
          {failed ? (
            <Txt variant="caption" multiline color={palette.secondary}>
              {t('gestures.forward.error')}
            </Txt>
          ) : rows !== null && rows.length === 0 ? (
            <Txt variant="caption" multiline color={palette.secondary}>
              {t('gestures.forward.none')}
            </Txt>
          ) : (
            shown.map((r) => (
              <ForwardRow
                key={r.farm}
                row={r}
                me={me}
                glance={glances[r.farm]}
                picked={picked.includes(r.farm)}
                onToggle={() => toggle(r.farm)}
              />
            ))
          )}
        </View>
        {picked.length >= FORWARD_LIMIT ? (
          <Txt variant="caption" color={palette.secondary}>
            {t('gestures.forward.limit')}
          </Txt>
        ) : null}
      </ScrollView>
    </View>
  );
}
