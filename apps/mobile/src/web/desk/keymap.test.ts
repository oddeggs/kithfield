import { describe, expect, it } from '@jest/globals';

import { actionOf, shortcutRows, type KeyPress } from './keymap';

const press = (key: string, mods: Partial<Omit<KeyPress, 'key'>> = {}): KeyPress => ({
  key,
  meta: false,
  ctrl: false,
  shift: false,
  alt: false,
  ...mods,
});

describe('desktop shortcuts', () => {
  it('reads ⌘ on a Mac and Ctrl elsewhere', () => {
    expect(actionOf(press('d', { meta: true }), true)).toEqual({ action: 'dewdrop' });
    expect(actionOf(press('d', { ctrl: true }), false)).toEqual({ action: 'dewdrop' });
    expect(actionOf(press('d', { ctrl: true }), true)).toBeNull();
    expect(actionOf(press('d', { meta: true }), false)).toBeNull();
  });

  it('tells the shifted letters apart', () => {
    expect(actionOf(press('T', { meta: true, shift: true }), true)).toEqual({
      action: 'quickTend',
    });
    expect(actionOf(press('F', { meta: true, shift: true }), true)).toEqual({ action: 'firefly' });
    expect(actionOf(press('S', { meta: true, shift: true }), true)).toEqual({ action: 'seed' });
  });

  it('reads the fire keys with ⌥, whatever letter ⌥ makes', () => {
    expect(actionOf(press('l', { meta: true, alt: true }), true)).toEqual({ action: 'fire' });
    expect(actionOf(press('¬', { meta: true, alt: true }), true)).toEqual({ action: 'fire' });
    expect(actionOf(press('µ', { meta: true, alt: true }), true)).toEqual({ action: 'mute' });
  });

  it('jumps to farms one to nine', () => {
    expect(actionOf(press('1', { meta: true }), true)).toEqual({ action: 'jump', index: 0 });
    expect(actionOf(press('9', { meta: true }), true)).toEqual({ action: 'jump', index: 8 });
    expect(actionOf(press('0', { meta: true }), true)).toBeNull();
  });

  it('ignores plain typing', () => {
    expect(actionOf(press('d'), true)).toBeNull();
    expect(actionOf(press('/'), true)).toBeNull();
  });

  it('draws the list with the platform’s own modifier names', () => {
    expect(shortcutRows(true)[0]?.keys).toEqual(['⌘D']);
    expect(shortcutRows(false)[0]?.keys).toEqual(['Ctrl+D']);
    expect(shortcutRows(true).map((r) => r.copy)).toContain('platforms.keys.list');
  });
});
