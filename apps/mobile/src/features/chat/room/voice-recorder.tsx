import { LIMITS, type Critter } from '@kithfield/contracts';
import { motion } from '@kithfield/theme';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { ArtIcon, ArtLoop } from '../../../ui/art/art-view';
import { useToast } from '../../../ui/components/toast';
import { useLocale } from '../../../ui/locale/locale-provider';
import { haptics } from '../../../ui/motion/haptics';
import { Press } from '../../../ui/motion/press';
import { useTheme } from '../../../ui/theme/theme-provider';
import { Txt } from '../../../ui/type/text';
import { clock } from '../model/format';
import { useChatColours } from '../ui/chat-colours';

/** A finished voice note, ready to upload. */
export interface Recorded {
  readonly uri: string;
  readonly durationMs: number;
  /** Levels 0–255, at most 64, for the drawn waveform. */
  readonly waveform: readonly number[];
}

/** Slide this far left to throw the note away, or this far up to keep recording hands-free. */
const CANCEL_AT = -110;
const LOCK_AT = -80;
const MIN_MS = 600;
const LIVE_BARS = 26;

/** Metering in dBFS (about -160 to 0) as a level 0–1. */
export const levelOf = (db: number | undefined): number =>
  db === undefined ? 0 : Math.min(1, Math.max(0, (db + 55) / 55));

/** Up to 64 levels (0–255) from the levels sampled while recording. */
export function waveformOf(levels: readonly number[]): number[] {
  if (levels.length === 0) return [];
  const n = Math.min(LIMITS.waveform, levels.length);
  return Array.from({ length: n }, (_, i) => {
    const from = Math.floor((i * levels.length) / n);
    const to = Math.max(from + 1, Math.floor(((i + 1) * levels.length) / n));
    const slice = levels.slice(from, to);
    return Math.round((Math.max(...slice) || 0) * 255);
  });
}

type Phase = 'idle' | 'held' | 'locked';

/**
 * Hold the mic to record (04-12): slide left to cancel, slide up to lock, at most five minutes, a
 * live waveform and your critter singing on twos. Releasing sends.
 */
export function useVoiceRecorder(onDone: (note: Recorded) => void) {
  const { t } = useLocale();
  const toast = useToast();
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
  const status = useAudioRecorderState(recorder, motion.twos.frameMs);
  const [phase, setPhaseState] = useState<Phase>('idle');
  const phaseRef = useRef<Phase>('idle');
  const setPhase = (next: Phase | ((p: Phase) => Phase)) => {
    phaseRef.current = typeof next === 'function' ? next(phaseRef.current) : next;
    setPhaseState(phaseRef.current);
  };
  const levels = useRef<number[]>([]);
  const started = useRef(0);
  const want = useRef(false);

  useEffect(() => {
    if (phaseRef.current === 'idle' || !status.isRecording) return;
    levels.current.push(levelOf(status.metering));
    if (status.durationMillis >= LIMITS.voiceMs) {
      toast.show(t('chat.voice.maxReached'));
      void finish(true);
    }
    // Sampled on every status tick while recording.
  }, [status.durationMillis]);

  const start = async () => {
    want.current = true;
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      want.current = false;
      toast.show(t('chat.voice.noMic'));
      return;
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    if (!want.current) return;
    levels.current = [];
    await recorder.prepareToRecordAsync();
    recorder.record();
    started.current = Date.now();
    haptics.tap();
    setPhase((p) => (p === 'idle' ? 'held' : p));
  };

  const finish = async (send: boolean) => {
    want.current = false;
    const was = phaseRef.current;
    setPhase('idle');
    if (!recorder.isRecording && was === 'idle') return;
    const durationMs = Date.now() - started.current;
    await recorder.stop().catch(() => undefined);
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(
      () => undefined,
    );
    const uri = recorder.uri;
    if (!send || !uri) return;
    if (durationMs < MIN_MS) {
      toast.show(t('chat.voice.tooShort'));
      return;
    }
    haptics.soft();
    onDone({
      uri,
      durationMs: Math.min(durationMs, LIMITS.voiceMs),
      waveform: waveformOf(levels.current),
    });
  };

  return {
    phase,
    elapsedMs: status.isRecording ? status.durationMillis : 0,
    level: levelOf(status.metering),
    levels: levels.current,
    start,
    lock: () => {
      if (phaseRef.current === 'held') setPhase('locked');
    },
    finish,
  };
}

export type VoiceRecorder = ReturnType<typeof useVoiceRecorder>;

/** The mic at the end of the composer: hold it to record. */
export function MicButton({ voice }: { readonly voice: VoiceRecorder }) {
  const { palette } = useTheme();
  const { t } = useLocale();
  const dx = useSharedValue(0);
  const dy = useSharedValue(0);
  const start = () => void voice.start();
  const release = (cancelled: boolean, locked: boolean) => {
    if (locked) return;
    void voice.finish(!cancelled);
  };
  const lock = () => {
    haptics.select();
    voice.lock();
  };
  const pan = usePanGesture({
    activateAfterLongPress: 120,
    onActivate: () => {
      'worklet';
      dx.set(0);
      dy.set(0);
      scheduleOnRN(start);
    },
    onUpdate: (e) => {
      'worklet';
      dx.set(Math.min(0, e.translationX));
      dy.set(Math.min(0, e.translationY));
      if (e.translationY < LOCK_AT) {
        dy.set(LOCK_AT);
        scheduleOnRN(lock);
      }
    },
    onDeactivate: (e) => {
      'worklet';
      scheduleOnRN(release, e.translationX < CANCEL_AT, e.translationY < LOCK_AT);
      dx.set(0);
      dy.set(0);
    },
  });
  const follow = useAnimatedStyle(() => ({
    transform: [{ translateX: dx.get() * 0.4 }, { translateY: dy.get() * 0.4 }],
  }));
  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        accessible
        accessibilityRole="button"
        accessibilityLabel={t('chat.composer.voice')}
        accessibilityActions={[{ name: 'activate' }]}
        onAccessibilityAction={() => {
          void voice.start().then(() => voice.lock());
        }}
        style={[
          {
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: palette.primary.bg,
            alignItems: 'center',
            justifyContent: 'center',
          },
          follow,
        ]}
      >
        <ArtIcon name="mic" size={22} color={palette.primary.fg} />
      </Animated.View>
    </GestureDetector>
  );
}

/** The recording panel over the composer (04-12). */
export function RecorderPanel({
  voice,
  me,
  name,
  season,
  bottomInset,
}: {
  readonly voice: VoiceRecorder;
  readonly me: Critter | null;
  readonly name: string;
  readonly season: string;
  readonly bottomInset: number;
}) {
  const { palette } = useTheme();
  const colours = useChatColours();
  const { t } = useLocale();
  if (voice.phase === 'idle') return null;
  const recent = voice.levels.slice(-LIVE_BARS);
  const bars = [...Array.from({ length: LIVE_BARS - recent.length }, () => 0), ...recent];
  // The critter sings on twos: a held drawing, nudged up with the voice's level.
  const sing = 1 + Math.round(voice.level * 3) * 0.02;
  return (
    <View
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        paddingTop: 14,
        paddingHorizontal: 12,
        paddingBottom: Math.max(bottomInset, 20) + 14,
        backgroundColor: colours.recorderBg,
        borderTopLeftRadius: 26,
        borderTopRightRadius: 26,
        boxShadow: '0 -10px 30px -14px rgba(40,25,10,.35)',
        gap: 14,
        zIndex: 30,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View
          style={{
            width: 58,
            height: 58,
            borderRadius: 29,
            backgroundColor: colours.recorderTile,
            overflow: 'hidden',
            transform: [{ scale: sing }],
          }}
        >
          <ArtLoop
            scene="stage"
            width={58}
            height={58}
            attrs={{
              kind: me?.species ?? 'rabbit',
              season,
              ...(me?.coat ? { coat: me.coat } : {}),
              ...(me?.outfit ? { outfit: me.outfit } : {}),
              ...(me?.outfitColor ? { ocolor: me.outfitColor } : {}),
            }}
          />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View
              style={{ width: 9, height: 9, borderRadius: 4.5, backgroundColor: colours.recording }}
            />
            <Txt
              variant="rowTitle"
              style={{ fontSize: 15, lineHeight: 15, fontVariant: ['tabular-nums'] }}
            >
              {clock(voice.elapsedMs)}
            </Txt>
            <Txt
              variant="caption"
              color={palette.secondary}
              style={{ fontSize: 13, lineHeight: 13 }}
            >
              {t('chat.voice.talking', { name })}
            </Txt>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2.5, height: 30 }}>
            {bars.map((level, i) => (
              <View
                key={i}
                style={{
                  width: 3,
                  height: Math.max(4, Math.round(level * 28)),
                  borderRadius: 2,
                  backgroundColor: i >= LIVE_BARS - 7 ? colours.waveLive : palette.text,
                }}
              />
            ))}
          </View>
        </View>
      </View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 6,
        }}
      >
        {voice.phase === 'locked' ? (
          <Press
            onPress={() => void voice.finish(false)}
            darken={false}
            accessibilityLabel={t('chat.voice.cancel')}
          >
            <Txt variant="body" color={colours.failInk}>
              {t('chat.voice.cancel')}
            </Txt>
          </Press>
        ) : (
          <Txt variant="body" color={palette.secondary} style={{ lineHeight: 15 }}>
            {t('chat.voice.slideCancel')}
          </Txt>
        )}
        <View style={{ alignItems: 'center', gap: 8 }}>
          {voice.phase === 'held' ? (
            <View
              accessible
              accessibilityLabel={t('chat.voice.lock')}
              style={{
                width: 40,
                height: 56,
                borderRadius: 20,
                backgroundColor: palette.card,
                borderWidth: 1,
                borderColor: colours.fieldBorder,
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingVertical: 8,
              }}
            >
              <ArtIcon name="lock" size={18} color={palette.secondary} />
              <Txt
                variant="caption"
                color={palette.placeholder}
                style={{ fontSize: 12, lineHeight: 12 }}
              >
                ⌃
              </Txt>
            </View>
          ) : null}
          {voice.phase === 'locked' ? (
            <Press
              onPress={() => void voice.finish(true)}
              haptic="soft"
              radius={36}
              accessibilityLabel={t('chat.voice.send')}
              style={{
                width: 72,
                height: 72,
                borderRadius: 36,
                backgroundColor: palette.go.bg,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Txt
                variant="body"
                color={palette.go.fg}
                style={{ fontSize: 26, lineHeight: 28, fontWeight: '700' }}
              >
                ↑
              </Txt>
            </Press>
          ) : (
            <View
              style={{
                width: 72,
                height: 72,
                borderRadius: 36,
                backgroundColor: palette.honey,
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 0 10px rgba(232,180,78,.25)',
              }}
            >
              <ArtIcon name="mic" size={32} color={palette.text} />
            </View>
          )}
        </View>
      </View>
    </View>
  );
}
