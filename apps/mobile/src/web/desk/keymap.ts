/**
 * The desktop's keyboard shortcuts (`14 Platforms`), as data: which keys do
 * what, how each is drawn on its key caps, and reading a key press as one. ⌘ is Ctrl on Windows
 * and Linux.
 */
export type DeskAction =
  'dewdrop' | 'quickTend' | 'search' | 'firefly' | 'seed' | 'jump' | 'fire' | 'mute' | 'list';

export interface KeyPress {
  readonly key: string;
  readonly meta: boolean;
  readonly ctrl: boolean;
  readonly shift: boolean;
  readonly alt: boolean;
}

/** What a key press asks for, with the farm's place for ⌘1 to ⌘9; null for anything else. */
export function actionOf(
  press: KeyPress,
  mac: boolean,
): { readonly action: DeskAction; readonly index?: number } | null {
  const command = mac ? press.meta && !press.ctrl : press.ctrl && !press.meta;
  if (!command) return null;
  const key = press.key.length === 1 ? press.key.toLowerCase() : press.key;
  if (press.alt && !press.shift) {
    // ⌥ changes the letter a key types on a Mac; `code` would be steadier, the letter is enough.
    if (key === 'l' || key === '¬') return { action: 'fire' };
    if (key === 'm' || key === 'µ') return { action: 'mute' };
    return null;
  }
  if (press.alt) return null;
  if (press.shift) {
    if (key === 't') return { action: 'quickTend' };
    if (key === 'f') return { action: 'firefly' };
    if (key === 's') return { action: 'seed' };
    return null;
  }
  if (key === 'd') return { action: 'dewdrop' };
  if (key === 'k') return { action: 'search' };
  if (key === '/') return { action: 'list' };
  if (/^[1-9]$/.test(key)) return { action: 'jump', index: Number(key) - 1 };
  return null;
}

/** The shortcuts list's rows, in the design's order: the keys as drawn, and the words' key. */
export function shortcutRows(mac: boolean): readonly {
  readonly keys: readonly string[];
  readonly copy: string;
}[] {
  const cmd = mac ? '⌘' : 'Ctrl+';
  const shift = mac ? '⇧' : 'Shift+';
  const alt = mac ? '⌥' : 'Alt+';
  return [
    { keys: [`${cmd}D`], copy: 'platforms.keys.dewdrop' },
    { keys: [`${cmd}${shift}T`], copy: 'platforms.keys.quickTend' },
    { keys: [':'], copy: 'platforms.keys.stickers' },
    { keys: [`${cmd}K`], copy: 'platforms.keys.search' },
    { keys: [`${cmd}${shift}F`], copy: 'platforms.keys.firefly' },
    { keys: [`${cmd}${shift}S`], copy: 'platforms.keys.seed' },
    { keys: [`${cmd}1`, `${cmd}9`], copy: 'platforms.keys.jump' },
    { keys: [`${alt}${cmd}L`], copy: 'platforms.keys.fire' },
    { keys: ['↑'], copy: 'platforms.keys.edit' },
    { keys: [`${cmd}/`], copy: 'platforms.keys.list' },
  ];
}
