import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { format, resolveConfig } from 'prettier';

import { type SlotId } from './limits';
import { STORE_DIR } from './paths';

/** Where an asset can be compared with the design: a box (or one panel of it) in a frame's render. */
export interface Reference {
  /** The render id in `design/renders/index.json`. */
  render: string;
  /** The region in the render's CSS pixels. */
  rect: [x: number, y: number, width: number, height: number];
}

export interface ManifestEntry {
  /** Under `store/`. */
  file: string;
  slot: SlotId;
  width: number;
  height: number;
  language: 'en' | 'vi';
  /** Seconds, for clips. */
  seconds?: number;
  /** What it was made from, in words: a board box, or the art itself. */
  source: string;
  reference?: Reference;
  /** English the Vietnamese rewrite left, besides names and system labels. */
  stillEnglish?: string[];
}

export interface Manifest {
  /** Regenerate with `pnpm --filter @kithfield/launch bake`. */
  generatedBy: string;
  assets: ManifestEntry[];
}

const PATH = join(STORE_DIR, 'manifest.json');

export function readManifest(): Manifest {
  if (!existsSync(PATH)) return { generatedBy: 'pnpm --filter @kithfield/launch bake', assets: [] };
  return JSON.parse(readFileSync(PATH, 'utf8')) as Manifest;
}

/** Adds or replaces entries by file, keeping the others, in file order. */
export async function mergeManifest(entries: readonly ManifestEntry[]): Promise<void> {
  const manifest = readManifest();
  const byFile = new Map(manifest.assets.map((e) => [e.file, e]));
  for (const entry of entries) byFile.set(entry.file, entry);
  manifest.assets = [...byFile.values()].sort((a, b) => a.file.localeCompare(b.file, 'en'));
  // Written as the repo's formatter would, so a rebake leaves nothing to format.
  const options = (await resolveConfig(PATH)) ?? {};
  writeFileSync(PATH, await format(JSON.stringify(manifest), { ...options, filepath: PATH }));
}
