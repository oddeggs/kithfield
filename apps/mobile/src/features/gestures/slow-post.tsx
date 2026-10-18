import { LIMITS, type SlowPostWhen } from '@kithfield/contracts';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { ArtStill } from '../../ui/art/art-view';
import { Button } from '../../ui/components/button';
import { Chip } from '../../ui/components/chip';
import { TextField } from '../../ui/components/text-field';
import { useLocale } from '../../ui/locale/locale-provider';
import { useTheme } from '../../ui/theme/theme-provider';
import { Txt } from '../../ui/type/text';
import { slowPostsTo } from './model/care';
import { defaultFriend, friendsOf } from './model/people';
import { useGestureSend } from './send';
import { DoorPicker } from './ui/door-picker';
import { leave } from './ui/presentation';
import { SceneScreen } from './ui/scene-screen';
import { one, useDeadlines, useGestureFarm } from './use-gesture-farm';

const ART_H = 560;
const SHEET_TOP = 516;
/** Room the door row and a letter on its way take in the sheet, which rises to make it. */
const PICKER_H = 52;
const ROW_H = 46;

/** When a slow post arrives, as the reader's language says it: "Saturday 07:00". */
function arrival(at: number, language: string): string {
  return new Intl.DateTimeFormat(language, {
    weekday: 'long',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(at));
}

/**
 * Slow post: your critter carries a letter overnight, arriving at the friend's next
 * morning or the coming weekend in their time zone. Until it arrives it can be brought back (an
 * `unsend`). A `slow_post` write; the farm sets `deliverAt`.
 */
export function SlowPostScreen() {
  const { t, language } = useLocale();
  const { palette } = useTheme();
  const params = useLocalSearchParams<{ to?: string }>();
  const g = useGestureFarm();
  const send = useGestureSend(g.farm);
  const [picked, setPicked] = useState<string | null>(null);
  const [when, setWhen] = useState<SlowPostWhen>('morning');
  const [letter, setLetter] = useState('');
  const to = picked ?? defaultFriend(g.state, g.me, one(params.to));
  const friend = g.friend(to);
  const name = friend?.name ?? t('gestures.aFriend');
  const mine = g.friend(g.me);
  const picking = one(params.to) === undefined && g.state?.kind !== 'visit';
  const posts = to && g.me ? slowPostsTo({ events: g.events, me: g.me, to }) : [];
  // Each can be brought back until it arrives: the farm's rule, asked as a dry run, and looked at
  // again the moment one arrives.
  useDeadlines(posts.map((p) => p.deliverAt));
  const onTheWay = posts.filter((p) => g.can({ kind: 'unsend', payload: { target: p.seq } })?.ok);

  const go = async () => {
    const text = letter.trim();
    if (!to || text === '') return;
    const ok = await send(
      'slow_post',
      { to, text, when },
      { haptic: 'soft', sent: t('gestures.sent.slowPost', { name }), icon: 'envelope' },
    );
    if (ok) leave();
  };
  const recall = (seq: number) =>
    void send('unsend', { target: seq }, { sent: t('gestures.sent.recalled'), icon: 'envelope' });

  return (
    <SceneScreen
      art={(width) => (
        <ArtStill
          scene="slowpost"
          width={width}
          height={ART_H}
          attrs={{ season: g.season, kind: mine?.kind ?? 'rabbit' }}
        />
      )}
      artHeight={ART_H}
      sheetTop={SHEET_TOP - (picking ? PICKER_H : 0) - (onTheWay.length > 0 ? ROW_H : 0)}
      tone="night"
      title={to ? t('gestures.slowPost.to', { name }) : t('gestures.slowPost.pick')}
    >
      <Txt variant="displayM" accessibilityRole="header" style={{ lineHeight: 28.6 }}>
        {t('gestures.slowPost.title')}
      </Txt>
      {onTheWay.slice(0, 1).map((p) => (
        <View key={p.seq} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Txt variant="caption" multiline color={palette.secondary} style={{ flex: 1 }}>
            {t('gestures.slowPost.onTheWay', { when: arrival(p.deliverAt, language) })}
          </Txt>
          <Chip label={t('gestures.slowPost.recall')} onPress={() => recall(p.seq)} />
        </View>
      ))}
      {picking ? (
        <DoorPicker friends={friendsOf(g.state, g.me)} picked={to} onPick={setPicked} />
      ) : (
        <Txt variant="sheetBody" multiline color={palette.body}>
          {when === 'morning'
            ? t('gestures.slowPost.morning', { name })
            : t('gestures.slowPost.weekend', { name })}
        </Txt>
      )}
      <TextField
        value={letter}
        onChangeText={setLetter}
        multiline
        maxLength={LIMITS.message}
        placeholder={t('gestures.slowPost.placeholder')}
        testID="slow-post-letter"
      />
      <View style={{ flexDirection: 'row', gap: 6 }} accessibilityRole="radiogroup">
        <Chip
          label={t('gestures.slowPost.byMorning')}
          kind={when === 'morning' ? 'selected' : 'suggestion'}
          onPress={() => setWhen('morning')}
        />
        <Chip
          label={t('gestures.slowPost.byWeekend')}
          kind={when === 'weekend' ? 'selected' : 'suggestion'}
          onPress={() => setWhen('weekend')}
        />
      </View>
      <Button
        label={t('gestures.slowPost.send')}
        kind="light"
        haptic="soft"
        disabled={!to || letter.trim() === ''}
        onPress={() => void go()}
      />
    </SceneScreen>
  );
}
