/** Builds `design/renders/index.json`: one entry per render id, sorted, with no timestamps. */

export type RenderKind = 'screen' | 'section' | 'page';

export interface RenderEntry {
  /** A screen id (`NN-NN`), or a path id for label-less files (`01-foundations/colour`). */
  id: string;
  kind: RenderKind;
  /** PNG path relative to `design/renders/`. */
  file: string;
  /** The design file it came from, e.g. `04 Farm and Chat.dc.html`. */
  source: string;
  title: string;
  /** CSS pixels of the captured element or viewport. */
  width: number;
  height: number;
  /** Device pixels per CSS pixel in the PNG. */
  scale: number;
  /** Variant suffix (`night`, `winter`, `winter.night`) → PNG path relative to `design/renders/`. */
  variants: Record<string, string>;
}

export interface RenderIndex {
  /** How each kind is named and scaled; see tools/design/README.md. */
  scheme: Record<RenderKind, string>;
  renders: Record<string, Omit<RenderEntry, 'id'>>;
}

export const SCHEME: Record<RenderKind, string> = {
  screen: '<id>.png per data-screen-label, <id>.<variant>.png per tweak; @3x up to 500 css px wide, @2x wider',
  section: '<file-slug>/<section-slug>.png per section of a file without screen labels; @2x',
  page: '<file-slug>/<width>/<section-slug>[-NN].png, one viewport per scroll stop; 390 @3x, 834 @2x, 1440 @1x',
};

function sortRecord<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b, 'en')));
}

/** Fails on a repeated id: two frames with one id would silently overwrite each other's PNG. */
export function buildIndex(entries: readonly RenderEntry[]): RenderIndex {
  const renders: Record<string, Omit<RenderEntry, 'id'>> = {};
  const seen = new Map<string, string>();
  for (const { id, ...rest } of entries) {
    const first = seen.get(id);
    if (first !== undefined) {
      throw new Error(`Render id ${id} appears twice: in ${first} and ${rest.source}`);
    }
    seen.set(id, rest.source);
    renders[id] = { ...rest, variants: sortRecord(rest.variants) };
  }
  return { scheme: SCHEME, renders: sortRecord(renders) };
}

/** Merges a partial run (`--only`) into the existing index so the other entries are kept. */
export function mergeIndex(previous: RenderIndex | null, next: RenderIndex): RenderIndex {
  return {
    scheme: next.scheme,
    renders: sortRecord({ ...(previous?.renders ?? {}), ...next.renders }),
  };
}
