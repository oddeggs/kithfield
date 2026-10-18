import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { fileSlug } from './naming';
import { labelsInSource } from './select';
import { type Tweak, readTweaks } from './tweaks';

export type FileMode = 'screens' | 'sections' | 'page';

export interface DesignFile {
  /** `04 Farm and Chat.dc.html` */
  name: string;
  /** `04-farm-and-chat` */
  slug: string;
  /** Screens when the file labels its frames; otherwise sections of a canvas file, or a scrolling page. */
  mode: FileMode;
  tweaks: Tweak[];
  /** Screen labels as written in the source. */
  labels: string[];
}

/** Classifies a `.dc.html` source. A canvas file without screen labels is rendered by section. */
export function describeDesignFile(name: string, html: string): DesignFile {
  const labels = labelsInSource(html);
  const canvas = /<meta\s+name="design_doc_mode"\s+content="canvas"/i.test(html);
  const mode: FileMode = labels.length > 0 ? 'screens' : canvas ? 'sections' : 'page';
  return { name, slug: fileSlug(name), mode, tweaks: readTweaks(html), labels };
}

export function listDesignFiles(designDir: string): DesignFile[] {
  return readdirSync(designDir)
    .filter((name) => name.endsWith('.dc.html'))
    .sort((a, b) => a.localeCompare(b, 'en'))
    .map((name) => describeDesignFile(name, readFileSync(join(designDir, name), 'utf8')));
}
