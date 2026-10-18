import { LIMITS, type FarmId } from '@kithfield/contracts';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useCallback } from 'react';

import { useToast } from '../../ui/components/toast';
import { useLocale } from '../../ui/locale/locale-provider';
import { mediaUploader, uploadAll, type PickedFile } from './media-seam';
import { fitsUpload } from './model/files';
import { useGestureSend } from './send';

const fromImage = (a: ImagePicker.ImagePickerAsset): PickedFile => ({
  uri: a.uri,
  name: a.fileName ?? a.uri.split('/').pop() ?? 'photo',
  mime: a.mimeType ?? (a.type === 'video' ? 'video/mp4' : 'image/jpeg'),
  bytes: a.fileSize ?? 0,
  width: a.width,
  height: a.height,
  ...(a.duration ? { durationMs: Math.round(a.duration) } : {}),
});

/** Photos and videos from the library (the system picker, which needs no permission). */
export async function pickPhotos(): Promise<PickedFile[]> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images', 'videos'],
    allowsMultipleSelection: true,
    selectionLimit: LIMITS.mediaItems,
    quality: 1,
  });
  return result.canceled ? [] : result.assets.map(fromImage);
}

/** A new photo or video from the camera; null when the camera isn't allowed. */
export async function takePhoto(): Promise<PickedFile[] | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) return null;
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images', 'videos'],
    quality: 1,
  });
  return result.canceled ? [] : result.assets.map(fromImage);
}

/** A document from Files. */
export async function pickDocument(): Promise<PickedFile[]> {
  const result = await DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled) return [];
  return result.assets.map((a) => ({
    uri: a.uri,
    name: a.name,
    mime: a.mimeType ?? 'application/octet-stream',
    bytes: a.size ?? 0,
  }));
}

/**
 * Sends picked photos and files as one `media` write: each goes up through the media feature's
 * upload first. Files over 100 MB are turned away before anything is sent.
 */
export function useSendFiles(farm: FarmId): (files: readonly PickedFile[]) => Promise<boolean> {
  const { t } = useLocale();
  const toast = useToast();
  const send = useGestureSend(farm);
  return useCallback(
    async (files) => {
      if (files.length === 0) return false;
      if (!files.every((f) => fitsUpload(f.bytes))) {
        toast.show(t('gestures.files.tooBig'));
        return false;
      }
      const uploader = mediaUploader();
      if (uploader === null) {
        toast.show(t('gestures.files.notReady'));
        return false;
      }
      const first = files[0]?.name ?? '';
      try {
        const items = await uploadAll(uploader, farm, files);
        return await send(
          'media',
          { items },
          { haptic: 'success', sent: t('gestures.sent.file', { name: first }) },
        );
      } catch {
        toast.show(t('gestures.files.failed', { name: first }));
        return false;
      }
    },
    [farm, send, t, toast],
  );
}
