import { describe, expect, it } from 'vitest';

import { colourFor, day, night, roles, tokenKey } from './colour';
import { between, captures, foundations } from './test/design';

const SWATCH =
  /<div style="font:600 13px\/1\.2 -apple-system,system-ui;color:#[0-9a-f]{6}">([a-z0-9-]+)<\/div>\s*<div style="font:12px\/1\.3 ui-monospace,Menlo,monospace;color:#[0-9a-f]{6}">(#[0-9A-Fa-f]{6})<\/div>\s*<div style="[^"]*">([^<]+)<\/div>/g;

function swatches(html: string): Record<string, { hex: string; usage: string }> {
  return Object.fromEntries(
    captures(html, SWATCH).map(([name = '', hex = '', usage = '']) => [
      tokenKey(name),
      { hex, usage },
    ]),
  );
}

const section = between(foundations(), 'id="colour"', 'id="type"');
const [dayHtml = '', nightHtml = ''] = section.split('Night (after local sunset');
const designDay = swatches(dayHtml);
const designNight = swatches(nightHtml);

describe('colour tokens match 01 Foundations', () => {
  it('reads both palettes from the design', () => {
    expect(Object.keys(designDay).length).toBeGreaterThan(0);
    expect(Object.keys(designNight).length).toBeGreaterThan(0);
  });

  it('has every day swatch, by name and hex as written', () => {
    const hexes = Object.fromEntries(Object.entries(designDay).map(([k, v]) => [k, v.hex]));
    expect(day).toEqual(hexes);
  });

  it('has every night swatch, by name and hex as written', () => {
    const hexes = Object.fromEntries(Object.entries(designNight).map(([k, v]) => [k, v.hex]));
    expect(night).toEqual(hexes);
  });

  it('pairs day and night roles only where the design gives them the same job', () => {
    expect(designDay['paper']?.usage).toBe('Screen background');
    expect(designNight['sky']?.usage).toBe('Screen background');
    expect(designDay['card']?.usage).toMatch(/fields, bubbles/);
    expect(designNight['bubble']?.usage).toMatch(/bubbles, fields/);
    expect(designDay['ink3']?.usage).toBe('Secondary text');
    expect(designNight['moon2']?.usage).toBe('Secondary text');
    expect(designNight['honey']?.usage).toBe('Primary on night');
    expect(colourFor('background', 'night')).toBe(night.sky);
    expect(colourFor('text', 'day')).toBe(day.ink);
    expect(Object.keys(roles)).toHaveLength(6);
  });
});

describe('tokenKey', () => {
  it('camel-cases hyphenated swatch names', () => {
    expect(tokenKey('ink-2')).toBe('ink2');
    expect(tokenKey('moss-tint')).toBe('mossTint');
    expect(tokenKey('paper')).toBe('paper');
  });
});
