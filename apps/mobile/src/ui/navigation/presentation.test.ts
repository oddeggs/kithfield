import { describe, expect, it } from '@jest/globals';
import { radii } from '@kithfield/theme';

import { detentFor, presentationFor, SHEETS, screenOptionsFor } from './presentation';

const palette = { background: '#F5EEE2', sheet: '#FBF6EA' };
const ctx = { screenH: 852, palette };

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
    expect(detentFor(286, 852)).toBeCloseTo(566 / 852);
    const card = screenOptionsFor('(modal)/farm-critter', ctx);
    expect(card).toEqual({
      headerShown: false,
      presentation: 'formSheet',
      contentStyle: { backgroundColor: palette.sheet },
      sheetCornerRadius: radii.sheet,
      sheetAllowedDetents: [(852 - 286) / 852, (852 - 150) / 852],
      sheetGrabberVisible: true,
      sheetLargestUndimmedDetentIndex: 0,
    });
  });

  it('keeps a sheet’s tops where the design puts them on any screen height', () => {
    const small = screenOptionsFor('(modal)/plans-remember', { ...ctx, screenH: 667 });
    expect(small.sheetAllowedDetents).toEqual([(667 - 214) / 667]);
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
      '(modal)/settings-leave',
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

  it('names only routes in the modal group, or development screens', () => {
    for (const route of Object.keys(SHEETS)) expect(route).toMatch(/^\((modal|dev)\)\//);
  });
});
