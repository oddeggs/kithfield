import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { glossaryEn } from './glossary.en';
import { glossaryVi } from './glossary.vi';

const foundations = join(import.meta.dirname, '../../../design/01 Foundations.dc.html');

function decode(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/** The glossary table in the design: each row's term and its Vietnamese. */
function designGlossary(): { term: string; vi: string }[] {
  const html = readFileSync(foundations, 'utf8');
  const start = html.indexOf('id="glossary"');
  const end = html.indexOf('Notes for the developer', start);
  const section = html.slice(start, end);
  const terms = [...section.matchAll(/<b style="font-weight:600">(.*?)<\/b>/g)];
  const vis = [...section.matchAll(/<span style="font:600 15px\/1.3 'Lora'[^"]*">(.*?)<\/span>/g)];
  expect(terms.length).toBe(vis.length);
  return terms.map((term, row) => ({
    term: decode(term[1] ?? ''),
    vi: decode(vis[row]?.[1] ?? ''),
  }));
}

/** "Dozing / sleepy" is one row and two words; each word reads capitalised on its own. */
function wordsOf(term: string): string[] {
  return term.split(' / ').map((word) => word.charAt(0).toUpperCase() + word.slice(1));
}

describe('the glossary', () => {
  const rows = designGlossary();

  it('finds the glossary table in the design', () => {
    expect(rows.length).toBeGreaterThanOrEqual(19);
  });

  it('has every design term with the design’s Vietnamese, letter for letter', () => {
    const entries = Object.entries(glossaryEn);
    for (const { term, vi } of rows) {
      for (const word of wordsOf(term)) {
        const found = entries.find(([, text]) => text === word);
        expect(found, `"${word}" is missing from the glossary`).toBeDefined();
        const key = found?.[0] as keyof typeof glossaryVi;
        expect(glossaryVi[key], `Vietnamese for "${word}"`).toBe(vi);
      }
    }
  });

  it('has nothing the design’s glossary does not list', () => {
    const words = new Set(rows.flatMap(({ term }) => wordsOf(term)));
    for (const text of Object.values(glossaryEn)) expect(words).toContain(text);
  });
});
