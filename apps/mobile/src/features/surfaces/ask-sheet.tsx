import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../../ui/components/button';
import { useLocale } from '../../ui/locale/locale-provider';
import { useTheme } from '../../ui/theme/theme-provider';
import { Txt } from '../../ui/type/text';
import { Body, Eyebrow, PromiseRow, Title, useSceneAttrs } from '../onboarding/kit';
import { SceneArt } from '../onboarding/scene-art';
import { answerAskSheet, type Device } from './asks';

/** The sheet's side margin, as the design draws it. */
const SIDE = 22;

/**
 * The farm asking for the mic (before you sit down) or the camera (lighting your lantern), before
 * iOS does: what it's for, what never happens, then yes or the gentle no.
 */
export function AskSheet({ device }: { readonly device: Device }) {
  const { t } = useLocale();
  const { palette } = useTheme();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const scene = useSceneAttrs();
  const params = useLocalSearchParams<{ name?: string }>();
  const name = typeof params.name === 'string' && params.name !== '' ? params.name : null;
  const answered = useRef(false);

  // Closed by a swipe: that's a no.
  useEffect(
    () => () => {
      if (!answered.current) answerAskSheet(device, false);
    },
    [device],
  );

  const answer = (yes: boolean) => {
    answered.current = true;
    answerAskSheet(device, yes);
    router.back();
  };

  const mic = device === 'mic';
  const title = mic
    ? name === null
      ? t('surfaces.ask.mic.titleAnyone')
      : t('surfaces.ask.mic.title', { name })
    : t('surfaces.ask.camera.title');
  const promises = mic
    ? [
        { text: t('surfaces.ask.mic.muted') },
        { text: t('surfaces.ask.mic.notKept') },
        { text: t('surfaces.ask.mic.background'), never: true },
      ]
    : [
        { text: t('surfaces.ask.camera.offEachTime') },
        { text: t('surfaces.ask.camera.flip') },
        { text: t('surfaces.ask.camera.notKept'), never: true },
      ];
  const critter = name ?? '';

  return (
    <View style={{ flex: 1, paddingHorizontal: SIDE, paddingTop: 10, gap: 10 }}>
      <SceneArt
        scene="spot"
        width={width - 16 - SIDE * 2}
        height={170}
        attrs={{ ...scene, name: mic ? 'letter' : 'media' }}
      />
      <Eyebrow>{mic ? t('surfaces.ask.kicker') : t('surfaces.ask.camera.kicker')}</Eyebrow>
      <Title size={26} line={1.12}>
        {title}
      </Title>
      <Body>
        {mic ? t('surfaces.ask.mic.body') : t('surfaces.ask.camera.body', { name: critter })}
      </Body>
      <View style={{ gap: 8, marginTop: 4 }}>
        {promises.map((p) => (
          <PromiseRow key={p.text} text={p.text} {...(p.never ? { never: true } : {})} />
        ))}
      </View>
      <View style={{ marginTop: 'auto', marginBottom: Math.max(30, insets.bottom), gap: 6 }}>
        <Txt
          variant="caption"
          align="center"
          color={palette.secondary}
          style={{ fontSize: 12.5, lineHeight: 17.5 }}
        >
          {t('surfaces.ask.next')}
        </Txt>
        <Button
          label={mic ? t('surfaces.ask.mic.yes') : t('surfaces.ask.camera.yes')}
          kind="go"
          onPress={() => answer(true)}
        />
        <Button
          label={mic ? t('surfaces.ask.mic.no') : t('surfaces.ask.camera.no', { name: critter })}
          kind="text"
          onPress={() => answer(false)}
        />
      </View>
    </View>
  );
}
