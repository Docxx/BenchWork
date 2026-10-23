/**
 * Citations in Pandoc's form, so Pandoc can format them later:
 * `[@smith2024]`, `[@smith2024; @lee2023]`, `[see @smith2024, p. 12]`.
 * The text between the brackets is kept exactly as written; only the keys
 * are read from it.
 */

/** A citation key after `@`: starts with a letter, digit or `_`; inner punctuation allowed. */
const KEY = /(?:^|[\s;[-])@([A-Za-z0-9_](?:[\w:.#$%&+?<>~/-]*[A-Za-z0-9_])?)/g;

/** A bracketed span on one line with no brackets inside, not part of `[[...]]`. */
const BRACKETS = /(?<!\[)\[([^[\]\n]+)\](?!\])/g;

/** The citation keys in the text between a citation's brackets. */
export function citationKeys(inner: string): string[] {
  return [...inner.matchAll(KEY)].map((m) => m[1] ?? '').filter((k) => k !== '');
}

export interface CitationMatch {
  /** Where `[` is. */
  index: number;
  /** Length including both brackets. */
  length: number;
  /** The text between the brackets. */
  inner: string;
}

/** Citations in a piece of text: bracketed spans that hold at least one `@key`. */
export function findCitations(text: string): CitationMatch[] {
  const found: CitationMatch[] = [];
  for (const m of text.matchAll(BRACKETS)) {
    const inner = m[1] ?? '';
    // `[text](url)` is a Markdown link, never a citation.
    if (text[m.index + m[0].length] === '(') continue;
    if (citationKeys(inner).length > 0) found.push({ index: m.index, length: m[0].length, inner });
  }
  return found;
}

/** How a citation shows when no module can name the works: `@smith2024; @lee2023`. */
export function plainCitationLabel(inner: string): string {
  const keys = citationKeys(inner);
  return keys.length > 0 ? keys.map((k) => `@${k}`).join('; ') : inner;
}
