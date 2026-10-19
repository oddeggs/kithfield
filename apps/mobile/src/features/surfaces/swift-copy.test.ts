import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from '@jest/globals';

import { swiftCopySource } from './swift-copy';

const file = join(__dirname, '../../../targets/_shared/SurfaceCopyTable.swift');

describe('the extensions’ copy', () => {
  it('is the surfaces catalogue, compiled into Swift', () => {
    const source = swiftCopySource();
    if (process.env['UPDATE_SWIFT_COPY'] === '1') writeFileSync(file, source);
    expect(readFileSync(file, 'utf8')).toBe(source);
  });

  it('carries both languages and their plural forms', () => {
    const source = swiftCopySource();
    expect(source).toContain('"widget.up": ["one": "{names} is up", "other": "{names} are up"]');
    expect(source).toContain('"widget.up": ["other": "{names} đang thức"]');
    expect(source).not.toContain('route.title');
  });
});
