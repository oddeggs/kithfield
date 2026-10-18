import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { readFont } from './sfnt';
import { allSources, fontSources, type Source } from './sources';

/** Where the fonts live: `@kithfield/theme/fonts/`. */
export const fontsDir = join(import.meta.dirname, '../../../packages/theme/fonts');

export function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** What is wrong with one downloaded or committed file, or null when it is the expected file. */
export function problemWith(source: Source, bytes: Uint8Array): string | null {
  const hash = sha256(bytes);
  if (hash !== source.sha256) return `${source.file}: SHA-256 ${hash}, expected ${source.sha256}`;
  const font = fontSources.find((f) => f.file === source.file);
  if (!font) return null;
  const info = readFont(bytes);
  if (info.postScriptName !== font.name)
    return `${source.file}: PostScript name ${info.postScriptName}, expected ${font.name}`;
  if (info.variable) return `${source.file}: a variable font, expected a static cut`;
  return null;
}

/** Every problem with the committed fonts and licences; empty when they match the sources. */
export function verify(dir: string = fontsDir): string[] {
  const problems: string[] = [];
  for (const source of allSources) {
    const path = join(dir, source.file);
    if (!existsSync(path)) problems.push(`${source.file}: missing`);
    else {
      const problem = problemWith(source, new Uint8Array(readFileSync(path)));
      if (problem) problems.push(problem);
    }
  }
  const expected = new Set(allSources.map((s) => s.file));
  for (const file of existsSync(dir) ? readdirSync(dir) : [])
    if (!expected.has(file)) problems.push(`${file}: not one of the sources`);
  return problems;
}
