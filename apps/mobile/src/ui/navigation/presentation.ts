import { radii } from '@kithfield/theme';

import type { Palette } from '../theme/palette';

/**
 * How each root route is presented. The root stack reads this before a screen mounts: native
 * sheets take their presentation and detents when they are created, so a screen setting them on
 * itself (`<Stack.Screen options>` in its file) is too late for detents and sheet sizing.
 *
 * - `app/(modal)/<feature>-<screen>.tsx`: a page sheet over the app, unless `SHEETS` names it.
 * - `app/(cover)/<feature>-<screen>.tsx`: full screen over everything (the photo viewer, the fire).
 * - A route in `SHEETS`: the sheet, overlay or cover listed there.
 */
export type Presentation = 'card' | 'modal' | 'fullScreenModal' | 'formSheet' | 'transparentModal';

/** How a route in `SHEETS` shows. */
export type SheetSpec =
  /** A sheet that rests at these heights, each given as its top's distance from the screen's top. */
  | {
      readonly kind: 'detents';
      readonly tops: readonly number[];
      readonly grabber: boolean;
      /** The largest detent the screen behind stays undimmed (and touchable) at. */
      readonly undimmedUpTo?: number;
    }
  /** A sheet that rests at these fractions of the screen's height. */
  | { readonly kind: 'fractions'; readonly detents: readonly number[]; readonly grabber: boolean }
  /** A sheet as tall as what it holds. */
  | { readonly kind: 'fit' }
  /** Transparent over the screen below, which stays drawn: the screen draws its own scrim. */
  | { readonly kind: 'overlay' }
  /** Full screen, rising from the bottom. */
  | { readonly kind: 'cover' };

/** The design's standard sheet: 30 radius and a grabber (`01 Foundations`, Sheets). */
const fit: SheetSpec = { kind: 'fit' };
const overlay: SheetSpec = { kind: 'overlay' };
const cover: SheetSpec = { kind: 'cover' };

/** The root routes that aren't a plain page sheet or cover, by route name. */
export const SHEETS: Readonly<Record<string, SheetSpec>> = {
  // A critter's card over the farm, the farm still lit and touchable above it at its first height.
  '(modal)/farm-critter': { kind: 'detents', tops: [286, 150], grabber: true, undimmedUpTo: 0 },
  '(modal)/farm-new': { kind: 'fractions', detents: [0.82, 1], grabber: true },
  '(modal)/plans-remember': { kind: 'detents', tops: [214], grabber: false },
  '(modal)/safety-report': fit,
  '(modal)/safety-block': fit,
  '(modal)/safety-note': fit,
  '(modal)/safety-appeal': fit,
  '(modal)/settings-sign-out': fit,
  '(modal)/settings-consent': fit,
  '(modal)/settings-remove': fit,
  // The gesture overlays draw their own scrim, blur and sheet on the UI thread.
  '(modal)/gestures-message': overlay,
  '(modal)/gestures-tray': overlay,
  '(modal)/gestures-reactions': overlay,
  '(modal)/gestures-attach': overlay,
  // The gesture scenes: a scene with its own sheet, full screen.
  '(modal)/gestures-firefly': cover,
  '(modal)/gestures-knock': cover,
  '(modal)/gestures-weather': cover,
  '(modal)/gestures-slow-post': cover,
  '(modal)/gestures-forward': cover,
  '(modal)/gestures-quick-tend': cover,
  // Asking for the mic and camera by the fire, and where the fire sounds.
  '(modal)/surfaces-mic': { kind: 'detents', tops: [190], grabber: true },
  '(modal)/surfaces-camera': { kind: 'detents', tops: [190], grabber: true },
  '(modal)/surfaces-sound': fit,
  // The sticker picker over a chat, the chat still lit and touchable above it at its first height.
  '(modal)/stickers-picker': { kind: 'detents', tops: [494, 110], grabber: true, undimmedUpTo: 0 },
  ...(__DEV__ ? { '(dev)/sheet-lab': fit } : {}),
};

/** The options the root stack gives a route (a subset of the native stack's own). */
export interface RootScreenOptions {
  readonly headerShown: false;
  readonly presentation: Presentation;
  readonly contentStyle: { readonly backgroundColor: string };
  readonly animation?: 'none' | 'slide_from_bottom';
  readonly gestureEnabled?: boolean;
  readonly sheetAllowedDetents?: number[] | 'fitToContents';
  readonly sheetGrabberVisible?: boolean;
  readonly sheetCornerRadius?: number;
  readonly sheetLargestUndimmedDetentIndex?: number;
}

export interface ScreenContext {
  /** The window's height in points (`useWindowDimensions`). */
  readonly screenH: number;
  readonly palette: Pick<Palette, 'background' | 'sheet'>;
}

/** A sheet top's distance from the screen's top as a native detent: the share of the screen below. */
export const detentFor = (top: number, screenH: number): number =>
  Math.min(1, Math.max(0, (screenH - top) / screenH));

/** How a group presents a route outside `SHEETS`. */
export function presentationFor(routeName: string): Presentation {
  if (routeName.startsWith('(modal)/')) return 'modal';
  if (routeName.startsWith('(cover)/')) return 'fullScreenModal';
  return 'card';
}

/** The root stack's options for `routeName`. */
export function screenOptionsFor(routeName: string, ctx: ScreenContext): RootScreenOptions {
  const base = {
    headerShown: false,
    contentStyle: { backgroundColor: ctx.palette.background },
  } as const;
  const spec = SHEETS[routeName];
  if (!spec) return { ...base, presentation: presentationFor(routeName) };
  const sheet = {
    headerShown: false,
    presentation: 'formSheet',
    contentStyle: { backgroundColor: ctx.palette.sheet },
    sheetCornerRadius: radii.sheet,
  } as const;
  switch (spec.kind) {
    case 'detents':
      return {
        ...sheet,
        sheetAllowedDetents: spec.tops
          .map((top) => detentFor(top, ctx.screenH))
          .sort((a, b) => a - b),
        sheetGrabberVisible: spec.grabber,
        ...(spec.undimmedUpTo !== undefined
          ? { sheetLargestUndimmedDetentIndex: spec.undimmedUpTo }
          : {}),
      };
    case 'fractions':
      return {
        ...sheet,
        sheetAllowedDetents: [...spec.detents].sort((a, b) => a - b),
        sheetGrabberVisible: spec.grabber,
      };
    case 'fit':
      return { ...sheet, sheetAllowedDetents: 'fitToContents', sheetGrabberVisible: true };
    case 'overlay':
      return {
        headerShown: false,
        presentation: 'transparentModal',
        animation: 'none',
        gestureEnabled: false,
        contentStyle: { backgroundColor: 'transparent' },
      };
    case 'cover':
      return { ...base, presentation: 'fullScreenModal', animation: 'slide_from_bottom' };
  }
}
