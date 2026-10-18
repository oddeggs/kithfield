import type { FarmId } from '@kithfield/contracts';
import {
  AudioModule,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { getDocumentAsync } from 'expo-document-picker';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDataClient } from '../../data';
import { ArtStill } from '../../ui/art/art-view';
import { Button } from '../../ui/components/button';
import { useLocale } from '../../ui/locale/locale-provider';
import { useTheme } from '../../ui/theme/theme-provider';
import { Txt } from '../../ui/type/text';
import { MediaImage } from './media-image';
import {
  captureWithCamera,
  MediaRefused,
  pickFromLibrary,
  VOICE_RECORDING_OPTIONS,
} from './prepare';
import { newItem, type UploadBatch } from './upload-model';
import { UploadingMessage } from './uploading-message';
import { useUpload, useUploads, useUploadSlow } from './use-upload';

/*
 * Development only: sends photos, video, files and voice notes from this phone to the first farm
 * it lives on, through the local API, and shows each message's progress and its photos read back
 * through signed URLs. The specimen at the top is the design's slow-upload state, drawn by the same components
 * from fixed progress, for comparing with the design.
 */

const SNAPS = ['river', 'picnic', 'dusk', 'garden'] as const;

/** The slow upload as drawn: one of four up, three at 64%, 22% and 4%. */
const specimen: UploadBatch = {
  id: 'specimen',
  farm: 'specimen',
  message: { command: 'media' },
  createdAt: 0,
  phase: 'uploading',
  opId: null,
  sentAt: null,
  retryAt: 0,
  failedAt: null,
  items: [1, 0.64, 0.22, 0.04].map((fraction, i) => ({
    ...newItem(`s${i}`, { uri: '', kind: 'photo', mime: 'image/jpeg', bytes: 100 }),
    phase: fraction === 1 ? 'done' : 'uploading',
    sentBytes: fraction * 100,
  })),
};

function Batch({ batch }: { readonly batch: UploadBatch }) {
  const upload = useUpload();
  const slow = useUploadSlow(batch.id);
  const { palette } = useTheme();
  const { t } = useLocale();
  const voice = batch.message.command === 'voice';
  return (
    <View style={{ gap: 6 }}>
      {voice || batch.items.some((i) => i.kind === 'file') ? (
        <Txt variant="note" color={palette.secondary} style={{ alignSelf: 'flex-end' }}>
          {batch.items
            .map((i) => `${i.kind} ${Math.round(i.bytes / 1024)} KB · ${i.phase}`)
            .join(', ')}
        </Txt>
      ) : (
        <UploadingMessage
          batch={batch}
          slow={slow}
          onCancel={(item) => upload.cancel(batch.id, item)}
          onSendSmaller={() => void upload.sendSmaller(batch.id)}
        />
      )}
      {batch.phase === 'sent' ? (
        <View style={{ flexDirection: 'row', gap: 6, alignSelf: 'flex-end', alignItems: 'center' }}>
          <Txt variant="note" color={palette.secondary}>
            {t('media.lab.sent')}
          </Txt>
          {batch.items
            .filter((i) => i.kind === 'photo' && i.key !== null)
            .map((i) => (
              <MediaImage
                key={i.id}
                mediaKey={i.key ?? ''}
                remoteOnly
                style={{ width: 44, height: 44, borderRadius: 8, overflow: 'hidden' }}
              />
            ))}
        </View>
      ) : null}
      {batch.items.some((i) => i.failure !== null) ? (
        <Button
          kind="secondary"
          size="small"
          label={t('media.retry')}
          onPress={() => upload.retry(batch.id)}
        />
      ) : null}
    </View>
  );
}

function Voice({
  farm,
  guard,
}: {
  readonly farm: FarmId;
  readonly guard: (action: () => Promise<unknown>) => () => void;
}) {
  const { t } = useLocale();
  const upload = useUpload();
  const recorder = useAudioRecorder(VOICE_RECORDING_OPTIONS);
  const state = useAudioRecorderState(recorder, 100);
  const levels = useRef<number[]>([]);
  useEffect(() => {
    // Metering is in dB (−160 to 0): kept as levels 0–255 for the waveform.
    if (state.isRecording && state.metering !== undefined) {
      levels.current.push(Math.round(Math.max(0, (state.metering + 60) / 60) * 255));
    }
  }, [state.isRecording, state.metering]);
  const start = async () => {
    const { granted } = await AudioModule.requestRecordingPermissionsAsync();
    if (!granted) return;
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    levels.current = [];
    await recorder.prepareToRecordAsync();
    recorder.record();
  };
  const stop = async () => {
    const durationMs = recorder.currentTime * 1000;
    await recorder.stop();
    if (recorder.uri === null) return;
    const all = levels.current;
    const step = Math.max(1, Math.ceil(all.length / 64));
    const waveform = all.filter((_, i) => i % step === 0).slice(0, 64);
    await upload.sendVoice(farm, { uri: recorder.uri, durationMs, waveform });
  };
  return state.isRecording ? (
    <Button kind="primary" size="medium" label={t('media.lab.voiceStop')} onPress={guard(stop)} />
  ) : (
    <Button
      kind="secondary"
      size="medium"
      label={t('media.lab.voiceStart')}
      onPress={guard(start)}
    />
  );
}

export function MediaLab() {
  const { t } = useLocale();
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const { api } = useDataClient();
  const upload = useUpload();
  const [farm, setFarm] = useState<FarmId | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const batches = useUploads(farm ?? '');
  useEffect(() => {
    void api.farms().then(
      ({ farms }) => setFarm(farms[0]?.farm ?? null),
      () => setFarm(null),
    );
  }, [api]);

  const guard = (action: () => Promise<unknown>) => () => {
    setNote(null);
    action().catch((error: unknown) => {
      console.warn('media lab', error);
      setNote(
        error instanceof MediaRefused && error.reason === 'too_large'
          ? t('media.failed.tooLarge')
          : t('media.failed.other'),
      );
    });
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.background }}
      contentContainerStyle={{
        paddingTop: insets.top + 12,
        paddingBottom: insets.bottom + 40,
        // The chat's own side margins, so the specimen sits where the design draws it.
        paddingHorizontal: 14,
        gap: 18,
      }}
    >
      <Txt variant="displayM" accessibilityRole="header">
        {t('media.lab.title')}
      </Txt>
      <Txt variant="caption" multiline color={palette.muted}>
        {t('media.lab.subtitle')}
      </Txt>
      <UploadingMessage
        batch={specimen}
        slow
        onCancel={() => undefined}
        onSendSmaller={() => undefined}
        tile={(_item, i) => (
          <ArtStill scene="snap" width={119} height={118} attrs={{ name: SNAPS[i] ?? 'river' }} />
        )}
      />
      <Txt variant="note" color={palette.secondary}>
        {farm === null ? t('media.lab.noFarm') : t('media.lab.farm', { farm })}
      </Txt>
      {farm !== null ? (
        <View style={{ gap: 8 }}>
          <Button
            kind="secondary"
            size="medium"
            label={t('media.lab.photos')}
            onPress={guard(async () => upload.sendPicked(farm, await pickFromLibrary()))}
          />
          <Button
            kind="secondary"
            size="medium"
            label={t('media.lab.camera')}
            onPress={guard(async () => upload.sendPicked(farm, await captureWithCamera()))}
          />
          <Button
            kind="secondary"
            size="medium"
            label={t('media.lab.video')}
            onPress={guard(async () => upload.sendPicked(farm, await pickFromLibrary('videos')))}
          />
          <Button
            kind="secondary"
            size="medium"
            label={t('media.lab.file')}
            onPress={guard(async () => {
              const picked = await getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
              if (!picked.canceled) await upload.sendDocuments(farm, picked.assets);
            })}
          />
          <Voice farm={farm} guard={guard} />
        </View>
      ) : null}
      {note !== null ? (
        <Txt variant="note" multiline color={palette.bubble.failedText}>
          {note}
        </Txt>
      ) : null}
      {[...batches].reverse().map((batch) => (
        <Batch key={batch.id} batch={batch} />
      ))}
    </ScrollView>
  );
}
