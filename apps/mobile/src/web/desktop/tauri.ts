/** Running inside the desktop app (Tauri), not a plain browser tab. */
export const inDesktop = (): boolean =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/** The critter's popover window: the same app, opened as its surface. */
export const POPOVER = 'popover';
export const POPOVER_SURFACE = 'tray';

/** Events between the app's window and the popover. */
export const EVENTS = {
  /** The popover asks for what to show; the app answers with `card`. */
  wanted: 'kithfield:tray-wanted',
  card: 'kithfield:tray-card',
  /** A button in the popover, for the app's window to act on. */
  action: 'kithfield:tray-action',
} as const;

/** What the critter's popover shows: a firefly waiting, friends by the fire, or nothing. */
export type TrayCard =
  | {
      readonly kind: 'firefly';
      readonly farm: string;
      readonly season: string;
      readonly from: string;
      readonly name: string;
      readonly species: string;
    }
  | {
      readonly kind: 'fire';
      readonly farm: string;
      readonly season: string;
      readonly line: string;
      readonly species: string | null;
    }
  | { readonly kind: 'quiet' };

export type TrayAction = 'open' | 'sendBack' | 'sit';

/** Which surface this page is: the app, or the critter's popover (`?surface=tray`). */
export const surfaceOf = (search: string): 'app' | 'tray' =>
  new URLSearchParams(search).get('surface') === POPOVER_SURFACE ? 'tray' : 'app';
