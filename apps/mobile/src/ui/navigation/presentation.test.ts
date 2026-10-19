import { describe, expect, it } from '@jest/globals';
import { radii } from '@kithfield/theme';

import { detentFor, presentationFor, SHEETS, screenOptionsFor } from './presentation';

const palette = { background: '#F5EEE2', sheet: '#FBF6EA' };
const insets = { top: 59, bottom: 34 };
const ctx = { screenH: 852, insets, palette };
/** On an iPhone 16: the tallest detent, and a sheet's detent height for a top, as iOS lays them out. */
const tallest = 852 - 59 - 34 - 34;
const height = (top: number) => 852 - top - 34 - 8.5;

describe('route presentation', () => {
  it('presents the modal group as sheets and the cover group full screen', () => {
    expect(presentationFor('(modal)/plans-plant')).toBe('modal');
    expect(presentationFor('(cover)/chat-search')).toBe('fullScreenModal');
    expect(presentationFor('(cover)/chat-viewer')).toBe('fullScreenModal');
  });

  it('pushes everything else', () => {
    expect(presentationFor('(tabs)')).toBe('card');
    expect(presentationFor('(onboarding)')).toBe('card');
    expect(presentationFor('modal-like')).toBe('card');
  });

  it('gives every route the theme’s background and no header', () => {
    expect(screenOptionsFor('(tabs)', ctx)).toEqual({
      headerShown: false,
      presentation: 'card',
      contentStyle: { backgroundColor: palette.background },
    });
    expect(screenOptionsFor('(cover)/chat-search', ctx).presentation).toBe('fullScreenModal');
  });
});

describe('sheet routes', () => {
  it('turns a sheet’s tops into detents, smallest first', () => {
    expect(detentFor(286, 852, insets)).toBeCloseTo(height(286) / tallest);
    const card = screenOptionsFor('(modal)/farm-critter', ctx);
    expect(card).toEqual({
      headerShown: false,
      presentation: 'formSheet',
      contentStyle: { backgroundColor: palette.sheet },
      sheetCornerRadius: radii.sheet,
      sheetAllowedDetents: [height(286) / tallest, height(150) / tallest],
      sheetGrabberVisible: true,
      sheetLargestUndimmedDetentIndex: 0,
    });
  });

  it('measures detents against the tallest sheet, not the whole screen, as iOS does', () => {
    // The fire's mic ask rests with its top 190 points down, as 10-12 draws it.
    const mic = screenOptionsFor('(modal)/surfaces-mic', ctx).sheetAllowedDetents;
    expect(mic).toEqual([height(190) / tallest]);
    expect(detentFor(10, 852, insets)).toBe(1);
  });

  it('fades the fire room in over the farm that zooms into it', () => {
    expect(screenOptionsFor('(cover)/fire-room', ctx)).toMatchObject({
      presentation: 'fullScreenModal',
      animation: 'fade',
    });
  });

  it('keeps a sheet’s tops where the design puts them on any screen height', () => {
    const se = { top: 20, bottom: 0 };
    const small = screenOptionsFor('(modal)/plans-remember', { ...ctx, screenH: 667, insets: se });
    expect(small.sheetAllowedDetents).toEqual([(667 - 214 - 8.5) / (667 - 20 - 34)]);
    expect(small.sheetGrabberVisible).toBe(false);
  });

  it('sizes the safety and settings sheets to what they hold', () => {
    for (const route of [
      '(modal)/safety-report',
      '(modal)/safety-block',
      '(modal)/safety-note',
      '(modal)/safety-appeal',
      '(modal)/settings-sign-out',
      '(modal)/settings-consent',
      '(modal)/settings-remove',
    ]) {
      expect(screenOptionsFor(route, ctx)).toMatchObject({
        presentation: 'formSheet',
        sheetAllowedDetents: 'fitToContents',
        sheetGrabberVisible: true,
        sheetCornerRadius: radii.sheet,
      });
    }
  });

  it('lays the gesture overlays over the screen below, with no transition or dimming of their own', () => {
    for (const name of ['message', 'tray', 'reactions', 'attach']) {
      expect(screenOptionsFor(`(modal)/gestures-${name}`, ctx)).toEqual({
        headerShown: false,
        presentation: 'transparentModal',
        animation: 'none',
        gestureEnabled: false,
        contentStyle: { backgroundColor: 'transparent' },
      });
    }
  });

  it('covers the screen for the gesture scenes', () => {
    for (const name of ['firefly', 'knock', 'weather', 'slow-post', 'forward', 'quick-tend']) {
      expect(screenOptionsFor(`(modal)/gestures-${name}`, ctx)).toMatchObject({
        presentation: 'fullScreenModal',
        animation: 'slide_from_bottom',
      });
    }
  });

  it('names only routes in the modal and cover groups, or development screens', () => {
    for (const route of Object.keys(SHEETS)) expect(route).toMatch(/^\((modal|cover|dev)\)\//);
  });
});
