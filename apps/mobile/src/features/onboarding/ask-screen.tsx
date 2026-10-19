import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '../../ui/components/button';
import { useLocale } from '../../ui/locale/locale-provider';
import { useTheme } from '../../ui/theme/theme-provider';
import { useAccessibilitySize } from '../../ui/type/accessibility-size';
import { Txt } from '../../ui/type/text';
import { askNextKey } from './ask-next';
import { SceneArt } from './scene-art';
import {
  AxFlow,
  BarAction,
  Body,
  BottomBar,
  Eyebrow,
  PromiseRow,
  Title,
  TopBar,
  useDesignTop,
  useSceneAttrs,
} from './kit';
import { useWayInWindow } from './way-in-frame';

export interface AskPromise {
  readonly text: string;
  readonly never?: boolean;
}

/**
 * A permission asked in the farm's voice: a critter with its prop, why, what will and won't
 * happen, then the yes (which the system asks about next) and the gentle no. Skip leaves the
 * feature off with no nag. The farm's explainer always comes before the system's alert.
 */
export function AskScreen({
  spot,
  eyebrow,
  title,
  body,
  promises,
  yes,
  no,
  systemAsksNext = true,
  onYes,
  onNo,
  onSkip,
  onBack,
}: {
  /** The spot scene's prop: `notif`, `contacts`, `photos` or `location`. */
  readonly spot: string;
  readonly eyebrow: string;
  readonly title: string;
  readonly body: string;
  readonly promises: readonly AskPromise[];
  readonly yes: string;
  readonly no: string;
  readonly systemAsksNext?: boolean;
  readonly onYes: () => Promise<void> | void;
  readonly onNo: () => void;
  readonly onSkip: () => void;
  readonly onBack: () => void;
}) {
  const { t } = useLocale();
  const { palette } = useTheme();
  const { width } = useWayInWindow();
  const top = useDesignTop();
  const scene = useSceneAttrs();
  const ax = useAccessibilitySize();
  const [busy, setBusy] = useState(false);

  const yesPressed = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onYes();
    } finally {
      setBusy(false);
    }
  };

  const bar = (
    <TopBar
      onBack={onBack}
      trailing={<BarAction label={t('onboarding.skip')} onPress={onSkip} />}
    />
  );
  const words = (
    <>
      <Eyebrow>{eyebrow}</Eyebrow>
      <Title>{title}</Title>
      <Body>{body}</Body>
      <View style={{ height: 6 }} />
      <View style={{ gap: 10 }}>
        {promises.map((p) => (
          <PromiseRow key={p.text} text={p.text} {...(p.never ? { never: true } : {})} />
        ))}
      </View>
    </>
  );
  const buttons = (
    <>
      {systemAsksNext ? (
        <Txt
          variant="caption"
          align="center"
          color={palette.secondary}
          style={{ fontSize: 13, lineHeight: 18.2, marginBottom: 2 }}
        >
          {t(askNextKey('onboarding.ask.next'))}
        </Txt>
      ) : null}
      <Button label={yes} onPress={() => void yesPressed()} disabled={busy} />
      <Button label={no} kind="text" onPress={onNo} />
    </>
  );
  if (ax) {
    return (
      <AxFlow bar={bar} footer={buttons}>
        <SceneArt scene="spot" width={width} height={270} attrs={{ ...scene, name: spot }} />
        <View style={{ paddingHorizontal: 28, gap: 10 }}>{words}</View>
      </AxFlow>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <SceneArt
        scene="spot"
        width={width}
        height={270}
        attrs={{ ...scene, name: spot }}
        style={{ position: 'absolute', top: top(64), left: 0 }}
      />
      {bar}
      <View style={{ position: 'absolute', top: top(350), left: 28, right: 28, gap: 10 }}>
        {words}
      </View>
      <BottomBar>{buttons}</BottomBar>
    </View>
  );
}
