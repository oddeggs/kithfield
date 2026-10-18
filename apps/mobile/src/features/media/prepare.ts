import { LIMITS } from '@kithfield/contracts';
import { AudioQuality, IOSOutputFormat, type RecordingOptions } from 'expo-audio';
import type { DocumentPickerAsset } from 'expo-document-picker';
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import {
  launchCameraAsync,
  launchImageLibraryAsync,
  UIImagePickerControllerQualityType,
  UIImagePickerPreferredAssetRepresentationMode,
  VideoExportPreset,
  type ImagePickerAsset,
  type ImagePickerOptions,
} from 'expo-image-picker';

import { uploadsDirectory } from './transport';
import type { LocalMedia } from './upload-model';
import { photoSize } from './sizing';

/*
 * Getting media ready on the phone, before anything goes up (`docs/backend.md` §5): photos at
 * 2048 px on the long side as JPEG, video compressed by iOS as it is picked, voice notes recorded
 * as AAC. Everything is copied into the queue's own folder, so it outlives the picker's cache.
 */

export const PHOTO_LONG_SIDE = 2048;
const PHOTO_QUALITY = 0.8;

/**
 * Video goes through iOS's export at pick time: H.264 at 1280×720 with AAC sound. The export also
 * leaves out the clip's location (a geotagged clip picked on the simulator came back with no
 * ISO 6709 location). A worst-case clip (full-frame noise) came out at about 10.7 Mbit/s, so
 * camera clips are held to 75 seconds to stay under 100 MB; a longer pick that still comes out over
 * 100 MB is refused with the "too big" line rather than sent.
 */
const VIDEO: Pick<
  ImagePickerOptions,
  'videoExportPreset' | 'videoQuality' | 'videoMaxDuration' | 'preferredAssetRepresentationMode'
> = {
  videoExportPreset: VideoExportPreset.H264_1280x720,
  videoQuality: UIImagePickerControllerQualityType.IFrame1280x720,
  videoMaxDuration: 75,
  // HEIC and other formats arrive as JPEG and H.264, which every phone can show.
  preferredAssetRepresentationMode: UIImagePickerPreferredAssetRepresentationMode.Compatible,
};

/** Voice notes: AAC in an `.m4a`, mono, 64 kbit/s; levels on, for the waveform. */
export const VOICE_RECORDING_OPTIONS: RecordingOptions = {
  extension: '.m4a',
  sampleRate: 44100,
  numberOfChannels: 1,
  bitRate: 64000,
  isMeteringEnabled: true,
  android: { outputFormat: 'mpeg4', audioEncoder: 'aac' },
  ios: { outputFormat: IOSOutputFormat.MPEG4AAC, audioQuality: AudioQuality.HIGH },
  web: { mimeType: 'audio/webm', bitsPerSecond: 64000 },
};

/** Something picked can't be sent as it is. */
export class MediaRefused extends Error {
  constructor(readonly reason: 'too_large' | 'unreadable') {
    super(`media refused: ${reason}`);
    this.name = 'MediaRefused';
  }
}

/** Photos and videos from the library, up to ten; empty when the person cancels. */
export async function pickFromLibrary(
  kinds: 'all' | 'videos' = 'all',
): Promise<ImagePickerAsset[]> {
  const result = await launchImageLibraryAsync({
    mediaTypes: kinds === 'all' ? ['images', 'videos'] : ['videos'],
    allowsMultipleSelection: kinds === 'all',
    selectionLimit: LIMITS.mediaItems,
    quality: 1,
    ...VIDEO,
  });
  return result.canceled ? [] : result.assets;
}

/** A photo or a clip from the camera; empty when the person cancels. */
export async function captureWithCamera(): Promise<ImagePickerAsset[]> {
  const result = await launchCameraAsync({
    mediaTypes: ['images', 'videos'],
    quality: 1,
    ...VIDEO,
  });
  return result.canceled ? [] : result.assets;
}

const fileName = (extension: string) =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}${extension}`;

/** Copies a file into the queue's folder; answers the copy and its size. */
async function keep(uri: string, extension: string): Promise<{ uri: string; bytes: number }> {
  const source = new File(uri);
  if (!source.exists) throw new MediaRefused('unreadable');
  const copy = new File(uploadsDirectory(), fileName(extension));
  await source.copy(copy);
  return { uri: copy.uri, bytes: copy.size };
}

/** A photo re-encoded as JPEG, its long side at most `longSide`. */
export async function encodePhoto(
  uri: string,
  width: number,
  height: number,
  longSide = PHOTO_LONG_SIDE,
): Promise<LocalMedia> {
  const size = photoSize(width, height, longSide);
  const context = ImageManipulator.manipulate(uri);
  if (size.resized) context.resize({ width: size.width, height: size.height });
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ compress: PHOTO_QUALITY, format: SaveFormat.JPEG });
  context.release();
  image.release();
  const kept = await keep(saved.uri, '.jpg');
  new File(saved.uri).delete();
  return {
    uri: kept.uri,
    kind: 'photo',
    mime: 'image/jpeg',
    bytes: kept.bytes,
    width: saved.width,
    height: saved.height,
  };
}

const extensionOf = (uri: string) => /\.[A-Za-z0-9]{1,8}$/.exec(uri)?.[0]?.toLowerCase() ?? '';

/** A picked or captured photo or video, ready for the queue. */
export async function prepareAsset(asset: ImagePickerAsset): Promise<LocalMedia> {
  if (asset.type !== 'video') return encodePhoto(asset.uri, asset.width, asset.height);
  const extension = extensionOf(asset.uri) || '.mp4';
  const kept = await keep(asset.uri, extension);
  if (kept.bytes > LIMITS.uploadBytes) {
    new File(kept.uri).delete();
    throw new MediaRefused('too_large');
  }
  return {
    uri: kept.uri,
    kind: 'video',
    mime: extension === '.mov' ? 'video/quicktime' : 'video/mp4',
    bytes: kept.bytes,
    ...(asset.width > 0 ? { width: asset.width } : {}),
    ...(asset.height > 0 ? { height: asset.height } : {}),
    ...(asset.duration != null && asset.duration > 0
      ? { durationMs: Math.round(asset.duration) }
      : {}),
  };
}

/** A voice note just recorded with `VOICE_RECORDING_OPTIONS`. */
export async function prepareVoice(uri: string, durationMs: number): Promise<LocalMedia> {
  const kept = await keep(uri, '.m4a');
  return {
    uri: kept.uri,
    kind: 'voice',
    mime: 'audio/mp4',
    bytes: kept.bytes,
    durationMs: Math.max(1, Math.min(LIMITS.voiceMs, Math.round(durationMs))),
  };
}

const MIME = /^[a-z]+\/[a-z0-9.+-]{1,80}$/;

/** A file from the document picker, up to 100 MB. */
export async function prepareDocument(asset: DocumentPickerAsset): Promise<LocalMedia> {
  if (asset.size !== undefined && asset.size > LIMITS.uploadBytes) {
    throw new MediaRefused('too_large');
  }
  const kept = await keep(asset.uri, extensionOf(asset.name));
  if (kept.bytes > LIMITS.uploadBytes) {
    new File(kept.uri).delete();
    throw new MediaRefused('too_large');
  }
  const mime = asset.mimeType?.toLowerCase() ?? '';
  return {
    uri: kept.uri,
    kind: 'file',
    mime: MIME.test(mime) ? mime : 'application/octet-stream',
    bytes: kept.bytes,
    name: asset.name.slice(0, 255),
  };
}
