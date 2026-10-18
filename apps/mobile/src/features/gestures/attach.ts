import type { FarmId } from '@kithfield/contracts';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useCallback } from 'react';

import { useToast } from '../../ui/components/toast';
import { useLocale } from '../../ui/locale/locale-provider';
import { haptics } from '../../ui/motion/haptics';
import { captureWithCamera, MediaRefused, pickFromLibrary, useUpload } from '../media';

export type AttachFrom = 'library' | 'camera' | 'files';

/**
 * Picks photos, a new photo or video, or a document, and hands them to the media feature, which
 * prepares, uploads and then writes the `media` message itself. Answers whether something was
 * handed over (false when nothing was picked, the camera isn't allowed or the file can't go).
 */
export function useAttach(farm: FarmId): (from: AttachFrom) => Promise<boolean> {
  const { t } = useLocale();
  const toast = useToast();
  const upload = useUpload();
  return useCallback(
    async (from) => {
      try {
        if (from === 'files') {
          const picked = await DocumentPicker.getDocumentAsync({
            copyToCacheDirectory: true,
            multiple: false,
          });
          if (picked.canceled || picked.assets.length === 0) return false;
          await upload.sendDocuments(farm, picked.assets);
        } else {
          if (from === 'camera') {
            const permission = await ImagePicker.requestCameraPermissionsAsync();
            if (!permission.granted) {
              toast.show(t('gestures.files.cameraDenied'));
              return false;
            }
          }
          const assets = from === 'camera' ? await captureWithCamera() : await pickFromLibrary();
          if (assets.length === 0) return false;
          await upload.sendPicked(farm, assets);
        }
        haptics.success();
        return true;
      } catch (error) {
        const tooBig = error instanceof MediaRefused && error.reason === 'too_large';
        toast.show(t(tooBig ? 'gestures.files.tooBig' : 'gestures.files.cantOpen'));
        return false;
      }
    },
    [farm, t, toast, upload],
  );
}
