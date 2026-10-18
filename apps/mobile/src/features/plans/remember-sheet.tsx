import type { FarmId, PersonId, Seq } from '@kithfield/contracts';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDataClient, useFarm, useOpenFarm } from '../../data';
import { ArtStill } from '../../ui/art/art-view';
import { TheirBubble } from '../../ui/components/bubble';
import { Button } from '../../ui/components/button';
import { useToast } from '../../ui/components/toast';
import { useLocale } from '../../ui/locale/locale-provider';
import { haptics } from '../../ui/motion/haptics';
import { Press } from '../../ui/motion/press';
import { useTheme } from '../../ui/theme/theme-provider';
import { Txt } from '../../ui/type/text';
import { formatTime, localParts, nudgeTimes, weekdayName, weekdayShort, type NudgeChoice } from './dates';
import { titleFrom } from './draft';
import { leave } from './chrome';
import { personOn } from './people';
import { usePlanLook } from './plan-look';
import { SeedArt } from './seed-art';
import { useMessage } from './use-message';
import { useMe } from './use-plans';

const CHOICES: readonly NudgeChoice[] = ['morning', 'evening', 'weekend'];

/**
 * The sheet rises over the chat to where the design draws it (its top 214 points down on an
 * 852-point screen), leaving the farm's strip in view, with the sheet's own grabber.
 */
export const REMEMBER_SHEET = {
  presentation: 'formSheet' as const,
  sheetAllowedDetents: [(852 - 214) / 852],
  sheetGrabberVisible: false,
  sheetCornerRadius: 30,
};
const TITLE_MAX = 80;

/** A section label as the sheet sets it: small capitals, a little apart. */
function Label({ text }: { readonly text: string }) {
  const { palette } = useTheme();
  return (
    <Txt
      variant="label"
      color={palette.muted}
      style={{ marginTop: 4 }}
    >
      {text}
    </Txt>
  );
}

/**
 * The remember-me seed: "big interview on thursday" becomes a nudge to ask how it went.
 * It is personal: kept by this person's cottage, never in the farm's log, and it grows nothing.
 * The friend it is about never sees it.
 */
export function RememberSheet({
  farm,
  seq,
  about,
}: {
  readonly farm: FarmId;
  readonly seq: Seq;
  readonly about: PersonId;
}) {
  useOpenFarm(farm);
  const { palette } = useTheme();
  const look = usePlanLook();
  const { t } = useLocale();
  const insets = useSafeAreaInsets();
  const { api } = useDataClient();
  const { show } = useToast();
  const me = useMe();
  const state = useFarm(farm)?.state ?? null;
  const message = useMessage(farm, seq);
  const friend = state ? personOn(state, about, me, t) : null;
  const [title, setTitle] = useState('');
  const [choice, setChoice] = useState<NudgeChoice>('morning');
  const [busy, setBusy] = useState(false);
  const prefilled = useRef(false);
  const friendName = friend?.name ?? null;
  useEffect(() => {
    if (prefilled.current || !message || friendName === null) return;
    prefilled.current = true;
    const draft = t('plans.remember.titleDraft', { name: friendName, text: titleFrom(message.text) });
    setTitle(draft.slice(0, TITLE_MAX));
  }, [message, friendName, t]);
  // The times are fixed when the sheet opens, from the message's words and when it was sent.
  const times = useMemo(() => {
    const now = new Date();
    return nudgeTimes(message?.text ?? '', message ? new Date(message.at) : now, now);
  }, [message]);
  const when = times[choice];
  const whenDay = localParts(when).day;
  const label = (c: NudgeChoice) => {
    const day = localParts(times[c]).day;
    if (c === 'weekend') return t('plans.remember.weekend');
    return t(c === 'morning' ? 'plans.remember.morning' : 'plans.remember.evening', {
      weekday: weekdayName(t, day),
    });
  };

  const plant = async () => {
    if (busy || title.trim() === '') return;
    setBusy(true);
    try {
      await api.remember({ farm, fromSeq: seq, about, title: title.trim(), nudgeAt: when.getTime() });
      haptics.success();
      show(t('plans.remember.planted'), 'sprout');
      leave();
    } catch {
      show(t('plans.remember.failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: palette.sheet }}>
      <ScrollView
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingTop: 10,
          paddingHorizontal: 20,
          paddingBottom: 34 + 56 + 24 + insets.bottom,
          gap: 12,
        }}
      >
        <View
          style={{ width: 36, height: 5, borderRadius: 3, backgroundColor: palette.grabber, alignSelf: 'center' }}
        />
        {message && friend ? (
          <View style={{ marginTop: 4 }}>
            <TheirBubble from={{ name: friend.name, kind: friend.kind, look: friend.look }}>
              {message.text}
            </TheirBubble>
          </View>
        ) : null}
        <View
          style={{
            borderRadius: 22,
            backgroundColor: palette.card,
            borderWidth: 1,
            borderColor: palette.cardBorder,
            paddingVertical: 12,
            paddingHorizontal: 14,
            flexDirection: 'row',
            gap: 12,
            alignItems: 'center',
          }}
        >
          <SeedArt stage={1} size={64} tile={look.seedTile} radius={18} />
          <View style={{ flex: 1 }}>
            <Txt variant="handS" color={look.hand}>
              {t('plans.remember.eyebrow')}
            </Txt>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder={t('plans.remember.titlePlaceholder')}
              placeholderTextColor={palette.placeholder}
              selectionColor={palette.go.bg}
              accessibilityLabel={t('plans.remember.titlePlaceholder')}
              maxLength={TITLE_MAX}
              multiline
              testID="plans-remember-title"
              style={{ fontSize: 17, lineHeight: 20.4, fontWeight: '600', color: palette.text, marginTop: 3, padding: 0 }}
            />
            {friend ? (
              <Txt variant="caption" color={palette.secondary} style={{ marginTop: 2, lineHeight: 18.2 }}>
                {t('plans.remember.private', { name: friend.name })}
              </Txt>
            ) : null}
          </View>
        </View>
        <Label text={t('plans.remember.nudgeMe')} />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 6 }}
          style={{ flexGrow: 0, marginHorizontal: -20 }}
        >
          <View style={{ width: 14 }} />
          {CHOICES.map((c) => {
            const on = c === choice;
            return (
              <Press
                key={c}
                onPress={() => setChoice(c)}
                haptic="select"
                radius={17}
                hitSlop={5}
                accessibilityLabel={label(c)}
                accessibilityState={{ selected: on }}
                style={{
                  height: 34,
                  paddingHorizontal: 13,
                  borderRadius: 17,
                  justifyContent: 'center',
                  backgroundColor: on ? palette.chip.selectedBg : palette.chip.suggestionBg,
                }}
              >
                <Txt
                  variant="chip"
                  color={on ? palette.chip.selectedFg : palette.chip.suggestionFg}
                  style={{ fontWeight: '600' }}
                >
                  {label(c)}
                </Txt>
              </Press>
            );
          })}
          <View style={{ width: 14 }} />
        </ScrollView>
        <Label text={t('plans.remember.youllSee', { weekday: weekdayName(t, whenDay) })} />
        <View
          accessible
          style={{
            borderRadius: 24,
            backgroundColor: look.preview,
            paddingVertical: 12,
            paddingHorizontal: 14,
            flexDirection: 'row',
            gap: 10,
            alignItems: 'flex-start',
          }}
        >
          <View style={{ width: 38, height: 38, borderRadius: 10, overflow: 'hidden' }}>
            <ArtStill scene="appicon" width={38} height={38} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
              <Txt variant="rowTitle" style={{ fontSize: 15, lineHeight: 18.75 }}>
                {t('push.app')}
              </Txt>
              <Txt variant="caption" color={palette.secondary} style={{ fontSize: 13, lineHeight: 16.25 }}>
                {t('plans.remember.when', {
                  weekday: weekdayShort(t, whenDay),
                  time: formatTime(t, localParts(when).time),
                })}
              </Txt>
            </View>
            <Txt variant="body" multiline style={{ lineHeight: 19.8, marginTop: 1 }}>
              {t('push.remember', { title: title.trim() || t('plans.remember.titlePlaceholder') })}
            </Txt>
          </View>
        </View>
      </ScrollView>
      <View style={{ position: 'absolute', left: 24, right: 24, bottom: 34 }}>
        <Button
          label={t('plans.remember.plant')}
          kind="go"
          disabled={busy || title.trim() === ''}
          onPress={() => void plant()}
        />
      </View>
    </View>
  );
}
