import { LIMITS } from '@kithfield/contracts';

/** What kind of file a bubble shows, by its type, for its label and icon. */
export type FileSort = 'pdf' | 'image' | 'video' | 'audio' | 'text' | 'sheet' | 'archive' | 'other';

export function sortOf(mime: string, name?: string): FileSort {
  const m = mime.toLowerCase();
  if (m === 'application/pdf') return 'pdf';
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('video/')) return 'video';
  if (m.startsWith('audio/')) return 'audio';
  if (m.startsWith('text/') || m.includes('word') || m.includes('rtf')) return 'text';
  if (m.includes('sheet') || m.includes('excel') || m.endsWith('/csv')) return 'sheet';
  if (m.includes('zip') || m.includes('compressed')) return 'archive';
  const ext = name?.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return 'pdf';
  return 'other';
}

/** The design's icon for each sort: a photo for pictures and video, a note for the rest. */
export const iconOf = (sort: FileSort): string =>
  sort === 'image' || sort === 'video' ? 'photo' : sort === 'audio' ? 'mic' : 'note';

/**
 * A file's size the way Files shows it: bytes in decimal units, one decimal place under 10.
 * Answers the number and its unit, for the catalogue to place.
 */
export function sizeOf(bytes: number): { value: string; unit: 'B' | 'KB' | 'MB' | 'GB' } {
  const units = ['B', 'KB', 'MB', 'GB'] as const;
  let v = bytes;
  let i = 0;
  while (v >= 1000 && i < units.length - 1) {
    v /= 1000;
    i += 1;
  }
  const unit = units[i] ?? 'GB';
  const value = i === 0 || v >= 10 ? String(Math.round(v)) : (Math.round(v * 10) / 10).toString();
  return { value, unit };
}

/**
 * Whether a picked file can be sent: up to the upload limit (100 MB). A size the picker didn't
 * report (0) is left to the upload to find out.
 */
export const fitsUpload = (bytes: number): boolean => bytes <= LIMITS.uploadBytes;

/** Which upload kind a picked file goes up as. */
export const uploadKindOf = (mime: string): 'photo' | 'video' | 'file' =>
  mime.startsWith('image/') ? 'photo' : mime.startsWith('video/') ? 'video' : 'file';
