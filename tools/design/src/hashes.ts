import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/** sha256 of every PNG under `dir`, keyed by its path relative to `dir` (always with `/`). */
export function hashPngs(dir: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (at: string): void => {
    for (const entry of readdirSync(at, { withFileTypes: true })) {
      const path = join(at, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith('.png')) {
        const rel = relative(dir, path).split(sep).join('/');
        out.set(rel, createHash('sha256').update(readFileSync(path)).digest('hex'));
      }
    }
  };
  walk(dir);
  return out;
}

export interface HashDiff {
  same: number;
  changed: string[];
  onlyInFirst: string[];
  onlyInSecond: string[];
}

export function diffHashes(a: Map<string, string>, b: Map<string, string>): HashDiff {
  const diff: HashDiff = { same: 0, changed: [], onlyInFirst: [], onlyInSecond: [] };
  for (const [path, hash] of a) {
    const other = b.get(path);
    if (other === undefined) diff.onlyInFirst.push(path);
    else if (other === hash) diff.same++;
    else diff.changed.push(path);
  }
  for (const path of b.keys()) if (!a.has(path)) diff.onlyInSecond.push(path);
  for (const list of [diff.changed, diff.onlyInFirst, diff.onlyInSecond]) list.sort();
  return diff;
}

/** One digest over a whole tree, for quoting in a report. */
export function treeDigest(hashes: Map<string, string>): string {
  const lines = [...hashes].sort(([x], [y]) => (x < y ? -1 : 1)).map(([p, h]) => `${h}  ${p}`);
  return createHash('sha256').update(lines.join('\n')).digest('hex');
}
