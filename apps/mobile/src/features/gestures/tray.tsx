import { LIMITS } from '@kithfield/contracts';
import { gestureMotion, motion } from '@kithfield/theme';
import { useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { ArtIcon } from '../../ui/art/art-view';
import { Button } from '../../ui/components/button';
import { GestureTile } from '../../ui/components/gesture-tray';
import { TextField } from '../../ui/components/text-field';
import { useLocale } from '../../ui/locale/locale-provider';
import { Press } from '../../ui/motion/press';
import { useTheme } from '../../ui/theme/theme-provider';
import { Txt } from '../../ui/type/text';
import { useAttach, type AttachFrom } from './attach';
import { cloudUp, defaultFriend } from './model/people';
import { open, routes } from './routes';
import { useGestureSend } from './send';
import { OverlaySheet } from './ui/overlay-sheet';
import { useOverlayClose } from './ui/presentation';
import { one, useGestureFarm } from './use-gesture-farm';
import { useGestureColours } from './ui/colours';

/** Cards come in one after another, 40 ms apart. */
const STAGGER_MS = gestureMotion.trayStaggerMs;

function Stagger({ i, children }: { readonly i: number; readonly children: ReactNode }) {
  return (
    <Animated.View
      style={{ flex: 1 }}
      entering={FadeInDown.delay(i * STAGGER_MS).duration(motion.fade.durationMs)}
    >
      {children}
    </Animated.View>
  );
}

/**
 * The + tray: tend without words. A dewdrop, a wave or a hug goes at once; a firefly,
 * a knock and a slow post open their own screens; a quiet note is written here. Photos and files
 * go up through the media feature. Every one is a farm write, and care is always free.
 */
export function TrayScreen() {
  const { t } = useLocale();
  const { palette } = useTheme();
  const gc = useGestureColours();
  const params = useLocalSearchParams<{ to?: string }>();
  const g = useGestureFarm();
  const send = useGestureSend(g.farm);
  const attach = useAttach(g.farm);
  const { closing, close } = useOverlayClose();
  const [note, setNote] = useState<string | null>(null);
  const to = defaultFriend(g.state, g.me, one(params.to)) ?? undefined;
  const toFriend = to ? { to } : {};

  const quick = async (kind: 'dewdrop' | 'wave' | 'hug', sent: string, icon: string) => {
    if (await send(kind, toFriend, { haptic: 'soft', sent, icon })) close();
  };
  const then = (where: () => void) => close(where);
  const hug = () => {
    const friend = g.friend(to ?? null);
    if (to && cloudUp(friend?.member ?? null, g.now)) then(() => open(routes.weather(g.farm, to)));
    else void quick('hug', t('gestures.sent.hug'), 'lantern');
  };
  const leaveNote = async () => {
    const text = note?.trim() ?? '';
    if (text === '') return;
    if (
      await send(
        'quiet_note',
        { text },
        { haptic: 'soft', sent: t('gestures.sent.quietNote'), icon: 'note' },
      )
    )
      close();
  };
  const files = async (from: AttachFrom) => {
    if (await attach(from)) close();
  };

  const pill = (icon: string, label: string, onPress: () => void) => (
    <Press
      onPress={onPress}
      radius={23}
      accessibilityLabel={label}
      style={{
        flex: 1,
        height: 46,
        borderRadius: 23,
        backgroundColor: palette.fillSoft,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
      }}
    >
      <ArtIcon name={icon} size={22} color={palette.text} />
      <Txt variant="buttonSmall">{label}</Txt>
    </Press>
  );

  return (
    <OverlaySheet
      inset={8}
      closing={closing}
      onClose={() => close()}
      padding={{ top: 12, side: 18, bottom: 28 }}
    >
      <View>
        <Txt variant="displayM" accessibilityRole="header" style={{ lineHeight: 28.6 }}>
          {note === null ? t('gestures.tray.title') : t('gestures.tray.quietNote')}
        </Txt>
        <Txt
          variant="credit"
          multiline
          color={palette.body}
          style={{ marginTop: 4, lineHeight: 20.3 }}
        >
          {note === null ? t('gestures.tray.body') : t('gestures.tray.quietNoteBody')}
        </Txt>
      </View>
      {note !== null ? (
        <>
          <TextField
            value={note}
            onChangeText={setNote}
            multiline
            autoFocus
            maxLength={LIMITS.message}
            placeholder={t('gestures.tray.notePlaceholder')}
            testID="tray-quiet-note"
          />
          <Button
            label={t('gestures.tray.noteSend')}
            disabled={note.trim() === ''}
            onPress={() => void leaveNote()}
          />
        </>
      ) : (
        <>
          <View style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Stagger i={0}>
                <GestureTile
                  icon="dewdrop"
                  title={t('gestures.tray.dewdrop')}
                  body={t('gestures.tray.dewdropBody')}
                  onPress={() => void quick('dewdrop', t('gestures.sent.dewdrop'), 'dewdrop')}
                />
              </Stagger>
              <Stagger i={1}>
                <GestureTile
                  icon="firefly"
                  tone="firefly"
                  title={t('gestures.tray.firefly')}
                  body={t('gestures.tray.fireflyBody')}
                  onPress={() => then(() => open(routes.firefly(g.farm, to)))}
                />
              </Stagger>
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Stagger i={2}>
                <GestureTile
                  icon="wave"
                  title={t('gestures.tray.wave')}
                  body={t('gestures.tray.waveBody')}
                  onPress={() => void quick('wave', t('gestures.sent.wave'), 'wave')}
                />
              </Stagger>
              <Stagger i={3}>
                <GestureTile
                  icon="note"
                  title={t('gestures.tray.quietNote')}
                  body={t('gestures.tray.quietNoteBody')}
                  onPress={() => setNote('')}
                />
              </Stagger>
            </View>
          </View>
          <Stagger i={4}>
            <Press
              onPress={() => then(() => open(routes.plant(g.farm)))}
              radius={22}
              accessibilityLabel={`${t('gestures.tray.plant')}. ${t('gestures.tray.plantBody')}`}
              style={{
                borderRadius: 22,
                backgroundColor: gc.mossPanel,
                paddingVertical: 12,
                paddingHorizontal: 14,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <ArtIcon name="seed" size={44} color={palette.text} />
              <View style={{ flex: 1 }}>
                <Txt variant="trayTitle">{t('gestures.tray.plant')}</Txt>
                <Txt
                  variant="traySubtitle"
                  multiline
                  color={gc.mossPanelText}
                  style={{ marginTop: 3 }}
                >
                  {t('gestures.tray.plantBody')}
                </Txt>
              </View>
              <Txt variant="chevron" color={gc.mossPanelChevron}>
                ›
              </Txt>
            </Press>
          </Stagger>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {pill('lantern', t('gestures.tray.hug'), hug)}
            {pill('door', t('gestures.tray.knock'), () =>
              then(() => open(routes.knock(g.farm, to))),
            )}
            {pill('envelope', t('gestures.tray.slowPost'), () =>
              then(() => open(routes.slowPost(g.farm, to))),
            )}
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {pill('camera', t('gestures.tray.photos'), () => void files('library'))}
            {pill('note', t('gestures.tray.files'), () => void files('files'))}
          </View>
        </>
      )}
    </OverlaySheet>
  );
}
