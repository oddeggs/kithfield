import type { DesktopLinkPreview } from '@kithfield/contracts';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ArtIcon } from '../../../ui/art/art-view';
import { useToast } from '../../../ui/components/toast';
import { useLocale } from '../../../ui/locale/locale-provider';
import { haptics } from '../../../ui/motion/haptics';
import { fadeTo, sheetTo } from '../../../ui/motion/motion';
import { Press } from '../../../ui/motion/press';
import { useReduceMotion } from '../../../ui/motion/reduce-motion';
import { useTheme } from '../../../ui/theme/theme-provider';
import { Txt } from '../../../ui/type/text';
import { ApiError, isNotServed } from '../api/request';
import { useSettingsApi } from '../api/use-api';
import { desktopCodeOf } from '../format';
import { confirmIdentity } from '../identity';
import { Pill, useDesignTop } from '../kit/layout';
import { KText } from '../kit/text';

const FRAME = 260;
const SHEET = 188;

/**
 * Signing in on a computer: the camera reads the one-time code the computer shows, the
 * phone names the computer and its town, and Face ID approves. The frame pulses honey once when
 * it finds a code; the sheet rises with the sheet spring.
 */
export function LinkScreen() {
  const { t } = useLocale();
  const { palette } = useTheme();
  const toast = useToast();
  const api = useSettingsApi();
  const reduce = useReduceMotion();
  const insets = useSafeAreaInsets();
  const top = useDesignTop();
  const [permission, requestPermission] = useCameraPermissions();
  const [code, setCode] = useState<string | null>(null);
  const [preview, setPreview] = useState<DesktopLinkPreview | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const looking = useRef(false);
  const pulse = useSharedValue(1);
  const rise = useSharedValue(0);

  useEffect(() => {
    rise.set(reduce ? fadeTo(preview ? 1 : 0) : sheetTo(preview ? 1 : 0, false));
  }, [preview, reduce, rise]);
  const frameStyle = useAnimatedStyle(() => ({ opacity: pulse.get() }));
  const sheetStyle = useAnimatedStyle(() =>
    reduce
      ? { opacity: rise.get() }
      : { transform: [{ translateY: (1 - rise.get()) * (SHEET + insets.bottom + 40) }] },
  );

  const scanned = (result: BarcodeScanningResult) => {
    const found = desktopCodeOf(result.data);
    if (found === null || looking.current || found === code) return;
    looking.current = true;
    haptics.tap();
    pulse.set(withSequence(fadeTo(0.35), fadeTo(1)));
    setCode(found);
    setProblem(null);
    api.desktopLink(found).then(
      (p) => setPreview(p),
      (error: unknown) => {
        looking.current = false;
        setProblem(
          isNotServed(error)
            ? t('settings.link.notFound')
            : error instanceof ApiError && error.status < 500
              ? t('settings.link.expired')
              : t('settings.failed'),
        );
      },
    );
  };

  const decline = () => {
    if (code) void api.declineDesktopLink(code).catch(() => undefined);
    router.back();
  };
  const approve = async () => {
    if (!code || !preview) return;
    setBusy(true);
    try {
      if (!(await confirmIdentity(t('settings.link.prompt', { name: preview.name })))) return;
      await api.approveDesktopLink(code);
      haptics.success();
      toast.show(t('settings.link.done', { name: preview.name }));
      router.back();
    } catch {
      setPreview(null);
      looking.current = false;
      setProblem(t('settings.link.expired'));
    } finally {
      setBusy(false);
    }
  };

  const granted = permission?.granted === true;
  const where = preview
    ? preview.city
      ? t('settings.link.where', {
          platform: t(`settings.platform.${preview.platform}`),
          place: preview.city,
        })
      : t('settings.link.whereNoPlace', { platform: t(`settings.platform.${preview.platform}`) })
    : '';

  return (
    <View style={{ flex: 1, backgroundColor: '#1d1a18' }}>
      {granted ? (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={preview ? undefined : scanned}
        />
      ) : null}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: top(230),
          alignSelf: 'center',
          width: FRAME,
          height: FRAME,
          borderRadius: 30,
          boxShadow: '0 0 0 2000px rgba(10,10,20,.35)',
        }}
      >
        <Animated.View
          style={[
            {
              position: 'absolute',
              top: -4,
              left: -4,
              right: -4,
              bottom: -4,
              borderWidth: 4,
              borderColor: palette.honey,
              borderRadius: 32,
            },
            frameStyle,
          ]}
        />
      </View>
      <View
        style={{
          position: 'absolute',
          top: top(520),
          left: 24,
          right: 24,
          alignItems: 'center',
          gap: 8,
        }}
      >
        <Txt
          variant="displayM"
          multiline
          align="center"
          color="#fff"
          accessibilityRole="header"
          style={{ lineHeight: 28.6 }}
        >
          {t('settings.link.title')}
        </Txt>
        <KText
          kind="sheetBody"
          multiline
          align="center"
          color="#dddddd"
          style={{ fontSize: 14.5, lineHeight: 21 }}
        >
          {problem ??
            (granted || permission === null
              ? t('settings.link.body')
              : permission.canAskAgain
                ? t('settings.link.camera')
                : t('settings.link.cameraOff'))}
        </KText>
        {permission && !granted ? (
          <Pill
            label={
              permission.canAskAgain
                ? t('settings.link.allowCamera')
                : t('settings.link.openSettings')
            }
            kind="honey"
            onPress={() =>
              permission.canAskAgain ? void requestPermission() : void Linking.openSettings()
            }
            style={{ marginTop: 8, alignSelf: 'stretch' }}
          />
        ) : null}
      </View>
      <View style={{ position: 'absolute', top: top(58), left: 16 }}>
        <Press
          onPress={decline}
          radius={22}
          accessibilityRole="button"
          accessibilityLabel={t('settings.link.close')}
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: 'rgba(255,255,255,.18)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Txt variant="body" color="#ffffff" style={{ fontSize: 22, lineHeight: 24 }}>
            ✕
          </Txt>
        </Press>
      </View>
      <Animated.View
        pointerEvents={preview ? 'auto' : 'none'}
        style={[
          {
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: palette.sheet,
            borderTopLeftRadius: 30,
            borderTopRightRadius: 30,
            boxShadow: palette.sheetShadow,
            paddingTop: 10,
            paddingHorizontal: 20,
            paddingBottom: Math.max(insets.bottom, 30),
            gap: 12,
          },
          sheetStyle,
        ]}
      >
        <View
          style={{
            width: 36,
            height: 5,
            borderRadius: 3,
            backgroundColor: palette.grabber,
            alignSelf: 'center',
          }}
        />
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <ArtIcon name="people" size={30} color={palette.text} />
          <View style={{ flex: 1 }}>
            <KText kind="rowTitle" multiline style={{ lineHeight: 18.6 }}>
              {preview ? t('settings.link.ask', { name: preview.name }) : ''}
            </KText>
            <KText kind="settingSub" color={palette.secondary}>
              {where}
            </KText>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pill
            label={t('settings.link.notMe')}
            height={50}
            onPress={decline}
            style={{ flex: 1 }}
          />
          <Pill
            label={t('settings.link.approve')}
            kind="go"
            height={50}
            disabled={busy}
            onPress={() => void approve()}
            style={{ flex: 1.3 }}
          />
        </View>
      </Animated.View>
    </View>
  );
}
