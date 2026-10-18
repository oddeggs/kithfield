import Constants from 'expo-constants';
import { Directory, File, Paths } from 'expo-file-system';

/*
 * What stickers keep on this phone, each person's apart: the recent row, the one "you're in a
 * sticker" note, the WhatsApp pack's identifier, the together stickers asked to leave. And everything stickers leave behind, cleared
 * when the person signs out.
 */

const PREFIX = 'stickers-';

type Kind = 'recent' | 'noted' | 'whatsapp-id' | 'together';

const EXTENSION: Record<Kind, string> = {
  recent: '.json',
  noted: '',
  'whatsapp-id': '.txt',
  together: '.json',
};

/** A person's own sticker file in the app's documents. */
export function personFile(kind: Kind, person: string): File {
  const safe = person.replace(/[^A-Za-z0-9_-]/g, '_');
  return new File(Paths.document, `${PREFIX}${kind}-${safe}${EXTENSION[kind]}`);
}

/** Folders of made stickers: the WhatsApp and Photos caches, the Messages drawer. */
function madeFolders(): Directory[] {
  const folders = [
    new Directory(Paths.cache, 'stickers-whatsapp'),
    new Directory(Paths.cache, 'stickers-photos'),
  ];
  const group = (Constants.expoConfig?.extra as { appGroup?: string } | undefined)?.appGroup;
  const root = group ? Paths.appleSharedContainers[group] : undefined;
  if (root) {
    folders.push(
      new Directory(root, 'surfaces/stickers/'),
      new Directory(root, 'surfaces/stickers-next/'),
    );
  }
  return folders;
}

/**
 * Everything stickers keep on this phone, gone: each person's files, the made stickers and the
 * Messages drawer (which would otherwise still offer the last person's critter). For sign-out.
 */
export function clearStickersForSignOut(): void {
  const remove = (entry: File | Directory) => {
    try {
      if (entry.exists) entry.delete();
    } catch {
      // Already gone, or held by the system: nothing of it can be read back.
    }
  };
  for (const entry of new Directory(Paths.document).list()) {
    if (entry instanceof File && entry.name.startsWith(PREFIX)) remove(entry);
  }
  for (const folder of madeFolders()) remove(folder);
}
