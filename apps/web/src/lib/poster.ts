import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A baked poster (`scripts/bake-images.ts`) as a data URI, read at build time, or null when the
 * images haven't been baked (a bare `astro dev`).
 */
export function posterUri(name: string): string | null {
  try {
    const bytes = readFileSync(join(process.cwd(), 'public', 'poster', `${name}.png`));
    return `data:image/png;base64,${bytes.toString('base64')}`;
  } catch {
    return null;
  }
}
