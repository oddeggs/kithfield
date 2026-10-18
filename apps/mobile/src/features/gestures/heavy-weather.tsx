import type { KNOWN_WARMTHS } from '@kithfield/contracts';
import { day } from '@kithfield/theme';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { ArtIcon, ArtStill } from '../../ui/art/art-view';
import { Button } from '../../ui/components/button';
import { CritterStack } from '../../ui/components/card';
import { useLocale } from '../../ui/locale/locale-provider';
import { Press } from '../../ui/motion/press';
import { useTheme } from '../../ui/theme/theme-provider';
import { Txt } from '../../ui/type/text';
import { umbrellaBrought, warmthFrom } from './model/care';
import { cloudUp, defaultFriend } from './model/people';
import { useGestureSend } from './send';
import { leave } from './ui/presentation';
import { SceneScreen } from './ui/scene-screen';
import { one, useGestureFarm } from './use-gesture-farm';

type Warmth = (typeof KNOWN_WARMTHS)[number];

const ART_H = 560;
const SHEET_TOP = 516;
/** Room for the umbrella beside who sent warmth, which may take two lines: the sheet rises. */
const UMBRELLA_H = 24;

const tiles: readonly { warmth: Warmth; icon: string; night: boolean }[] = [
  { warmth: 'here', icon: 'lantern', night: true },
  { warmth: 'thinking', icon: 'sun', night: false },
  { warmth: 'soup', icon: 'note', night: false },
  { warmth: 'glow', icon: 'firefly', night: true },
];

/**
 * Heavy weather: a friend raised a rain cloud over their cottage. Send a little warmth (a
 * hug carrying `here`, `thinking`, `soup` or `glow`) or bring an umbrella (a hug with
 * `umbrella`). Who already sent warmth is named, never counted.
 */
export function HeavyWeatherScreen() {
  const { t } = useLocale();
  const { palette } = useTheme();
  const params = useLocalSearchParams<{ to?: string }>();
  const g = useGestureFarm();
  const send = useGestureSend(g.farm);
  const [warmth, setWarmth] = useState<Warmth>('here');
  const to = defaultFriend(g.state, g.me, one(params.to));
  const friend = g.friend(to);
  const name = friend?.name ?? t('gestures.aFriend');
  const raised = cloudUp(friend?.member ?? null, g.now);
  const since = friend?.member?.cloudAt ?? 0;
  const status = g.view?.critters.find((c) => c.person === to)?.status ?? null;
  const senders =
    to && g.me ? warmthFrom({ events: g.events, to, since, me: g.me }).map((p) => g.friend(p)) : [];
  const known = senders.filter((f) => f !== null);
  const names = known.map((f) => f.name ?? t('gestures.aFriend'));
  const brought =
    to !== null && g.me !== null && umbrellaBrought({ events: g.events, to, since, me: g.me });

  const sentLine =
    names.length === 0
      ? null
      : names.length === 1
        ? t('gestures.weather.sentOne', { first: names[0] ?? '' })
        : names.length === 2
          ? t('gestures.weather.sentTwo', { first: names[0] ?? '', second: names[1] ?? '' })
          : t('gestures.weather.sentMany', { first: names[0] ?? '', second: names[1] ?? '' });

  const hug = async () => {
    if (!to) return;
    const ok = await send(
      'hug',
      { to, warmth },
      { haptic: 'soft', sent: t('gestures.sent.warmth', { name }), icon: 'lantern' },
    );
    if (ok) leave();
  };
  const umbrella = () => {
    if (!to || brought) return;
    void send(
      'hug',
      { to, umbrella: true },
      { haptic: 'soft', sent: t('gestures.sent.umbrella', { name }), icon: 'raincloud' },
    );
  };

  return (
    <SceneScreen
      art={(width) => (
        <ArtStill scene="weather" width={width} height={ART_H} attrs={{ season: g.season }} />
      )}
      artHeight={ART_H}
      sheetTop={raised ? SHEET_TOP - UMBRELLA_H : SHEET_TOP}
      tone="day"
      title={t('gestures.weather.cottage', { name })}
      overArt={
        status && raised ? (
          <Txt
            variant="handL"
            align="center"
            color={day.ink2}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: 116,
              fontSize: 19,
              lineHeight: 19,
            }}
          >
            {t('gestures.weather.says', { words: status, name })}
          </Txt>
        ) : null
      }
      footer={
        <Button
          label={t('gestures.weather.send')}
          kind="light"
          disabled={!to}
          onPress={() => void hug()}
        />
      }
    >
      <Txt variant="displayM" multiline accessibilityRole="header" style={{ lineHeight: 28.6 }}>
        {raised
          ? t('gestures.weather.title', { name })
          : t('gestures.weather.clearTitle', { name })}
      </Txt>
      <Txt variant="sheetBody" multiline color={palette.body}>
        {raised ? t('gestures.weather.body', { name }) : t('gestures.weather.clearBody')}
      </Txt>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {known.length > 0 ? (
          <CritterStack
            friends={known
              .slice(0, 3)
              .map((f) => ({ name: f.name ?? '', kind: f.kind, look: f.look }))}
            size={24}
            ring={palette.sheet}
          />
        ) : null}
        <Txt
          variant="planDetail"
          multiline
          color={palette.secondary}
          style={{ flex: 1, lineHeight: 19.17 }}
        >
          {sentLine ?? ''}
        </Txt>
        {raised ? (
          // A line of moss words, so the row stays one line tall above the warmth tiles.
          <Press
            onPress={umbrella}
            disabled={brought}
            darken={false}
            haptic="soft"
            hitSlop={12}
            accessibilityLabel={
              brought ? t('gestures.weather.umbrellaBrought') : t('gestures.weather.umbrella')
            }
          >
            <Txt variant="buttonSmall" color={brought ? palette.secondary : palette.go.bg}>
              {brought ? t('gestures.weather.umbrellaBrought') : t('gestures.weather.umbrella')}
            </Txt>
          </Press>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }} accessibilityRole="radiogroup">
        {tiles.map((tile) => {
          const on = tile.warmth === warmth;
          const fg = tile.night ? palette.firefly.fg : palette.text;
          return (
            <Press
              key={tile.warmth}
              onPress={() => setWarmth(tile.warmth)}
              haptic="select"
              radius={18}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={t(`gestures.weather.${tile.warmth}`)}
              style={{
                flex: 1,
                height: 84,
                borderRadius: 18,
                backgroundColor: tile.night ? palette.firefly.bg : palette.card,
                borderWidth: 1,
                borderColor: palette.cardBorder,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 5,
                paddingHorizontal: 4,
                boxShadow: on
                  ? `0 0 0 2.5px ${palette.sheet}, 0 0 0 4.5px ${day.honey}`
                  : undefined,
              }}
            >
              <ArtIcon name={tile.icon} size={34} color={fg} />
              <Txt
                variant="bubbleName"
                multiline
                align="center"
                color={fg}
                style={{ lineHeight: 13.8 }}
              >
                {t(`gestures.weather.${tile.warmth}`)}
              </Txt>
            </Press>
          );
        })}
      </View>
    </SceneScreen>
  );
}
