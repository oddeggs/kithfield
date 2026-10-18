import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  catalogueIndexSource,
  exportStem,
  findCatalogueFiles,
  generatedFileName,
  sourceDir,
} from '../scripts/generate-catalogues';

const folders: string[] = [];

function folderWith(files: Readonly<Record<string, string>>): string {
  const dir = mkdtempSync(join(tmpdir(), 'kithfield-i18n-'));
  folders.push(dir);
  for (const [name, source] of Object.entries(files)) writeFileSync(join(dir, name), source);
  return dir;
}

afterEach(() => {
  for (const dir of folders.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('the generated index', () => {
  it('is up to date with the catalogue files (run `pnpm --filter @kithfield/i18n gen`)', () => {
    const dir = sourceDir();
    const written = readFileSync(join(dir, generatedFileName), 'utf8');
    expect(written).toBe(catalogueIndexSource(findCatalogueFiles(dir)));
  });

  it('is reached only through code that runs in every bundler (no Node modules)', () => {
    const dir = sourceDir();
    const runtime = readdirSync(dir).filter(
      (name) => name.endsWith('.ts') && !name.endsWith('.test.ts'),
    );
    for (const name of runtime) {
      expect(readFileSync(join(dir, name), 'utf8'), name).not.toMatch(/from 'node:/);
    }
  });
});

describe('findCatalogueFiles', () => {
  it('pairs English and Vietnamese files, sorted, and spots the optional same-in-both list', () => {
    const dir = folderWith({
      'seed-bed.en.ts': 'export const seedBedEn = {};',
      'seed-bed.vi.ts': 'export const seedBedVi = {};\nexport const seedBedSameInBoth = [];',
      'farm.en.ts': 'export const farmEn = {};',
      'farm.vi.ts': 'export const farmVi = {};',
      'farm.test.ts': '',
      'translate.ts': '',
    });
    expect(findCatalogueFiles(dir)).toEqual([
      { file: 'farm', name: 'farm', hasSameInBoth: false },
      { file: 'seed-bed', name: 'seedBed', hasSameInBoth: true },
    ]);
  });

  it('refuses a feature with only one language', () => {
    const dir = folderWith({ 'farm.en.ts': 'export const farmEn = {};' });
    expect(() => findCatalogueFiles(dir)).toThrow('farm.en.ts has no farm.vi.ts');
  });

  it('refuses a file that does not export the expected name', () => {
    const dir = folderWith({
      'farm.en.ts': 'export const en = {};',
      'farm.vi.ts': 'export const farmVi = {};',
    });
    expect(() => findCatalogueFiles(dir)).toThrow('farm.en.ts must export const farmEn');
  });

  it('refuses a file name that is not kebab-case', () => {
    const dir = folderWith({ 'seedBed.en.ts': '', 'seedBed.vi.ts': '' });
    expect(() => findCatalogueFiles(dir)).toThrow('kebab-case');
  });
});

describe('catalogueIndexSource', () => {
  it('imports every pair and merges them into en and vi', () => {
    const source = catalogueIndexSource([
      { file: 'fire-room', name: 'fireRoom', hasSameInBoth: true },
    ]);
    expect(source).toContain("import { fireRoomEn } from './fire-room.en';");
    expect(source).toContain("import { fireRoomSameInBoth, fireRoomVi } from './fire-room.vi';");
    expect(source).toContain('export const en = {\n  ...fireRoomEn,\n};');
    expect(source).toContain('export const vi = {\n  ...fireRoomVi,\n};');
  });

  it('names kebab-case files in camelCase', () => {
    expect(exportStem('sit-by-the-fire')).toBe('sitByTheFire');
    expect(exportStem('farm')).toBe('farm');
  });
});
