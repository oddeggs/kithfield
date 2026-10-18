/** `--only` filters: screen ids (`NN-NN`), file numbers (`NN`) or file slugs (`01-foundations`). */

export function parseOnly(arg: string | undefined): string[] {
  return (arg ?? '')
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

function matches(value: string, tokens: readonly string[]): boolean {
  return tokens.some((t) => value === t || value.startsWith(`${t}-`) || value.startsWith(`${t}/`));
}

/** A token selects a whole file when it is the file's number or slug (or a prefix of the slug). */
export function fileSelected(slug: string, tokens: readonly string[]): boolean {
  return tokens.length === 0 || matches(slug, tokens);
}

/** A token selects a screen when it is the screen's id or its file number. */
export function idSelected(id: string, tokens: readonly string[]): boolean {
  return tokens.length === 0 || matches(id.toLowerCase(), tokens);
}

/** Screen labels as written in a `.dc.html` source (static, before the template renders). */
export function labelsInSource(html: string): string[] {
  return [...html.matchAll(/\bdata-screen-label="([^"]*)"/g)].map((m) => m[1] ?? '');
}
