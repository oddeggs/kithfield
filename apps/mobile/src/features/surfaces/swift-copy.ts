// The catalogue files themselves (the package exports only its lookup); this runs in tests only.
import { surfacesEn } from '../../../../../packages/i18n/src/surfaces.en';
import { surfacesVi } from '../../../../../packages/i18n/src/surfaces.vi';

/*
 * The extensions run no JavaScript, so the copy they show is compiled into them: the
 * `surfaces.native.*` keys of the surfaces catalogue, written out as a Swift table
 * (`targets/_shared/SurfaceCopy.swift`). A test checks the committed file matches.
 */

const PREFIX = 'surfaces.native.';

type Entry = string | { readonly other: string; readonly one?: string };

/** A Swift string literal. */
const literal = (text: string) =>
  `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;

function table(catalogue: Readonly<Record<string, Entry>>): string {
  const rows = Object.entries(catalogue)
    .filter(([key]) => key.startsWith(PREFIX))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, entry]) => {
      const forms: [string, string][] =
        typeof entry === 'string'
          ? [['other', entry]]
          : [
              ...(entry.one === undefined ? [] : ([['one', entry.one]] as [string, string][])),
              ['other', entry.other],
            ];
      const value = forms.map(([form, text]) => `${literal(form)}: ${literal(text)}`).join(', ');
      return `      ${literal(key.slice(PREFIX.length))}: [${value}],`;
    });
  return rows.join('\n');
}

/** The generated Swift source. */
export function swiftCopySource(): string {
  return `// Generated from packages/i18n/src/surfaces.*.ts by apps/mobile/src/features/surfaces/swift-copy.ts.
// Do not edit: change the catalogue, then run the surfaces copy test with UPDATE_SWIFT_COPY=1.

/// The extensions' copy by language, key (without \`${PREFIX}\`) and plural form.
enum SurfaceCopyTable {
  static let entries: [String: [String: [String: String]]] = [
    "en": [
${table(surfacesEn)}
    ],
    "vi": [
${table(surfacesVi)}
    ],
  ]
}
`;
}
