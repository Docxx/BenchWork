/**
 * Changes the targets of wiki links in a page's text, for when the pages
 * they point at are renamed or moved. Only the target changes: `!`,
 * `#heading`, `^block` and `|shown text` stay, links in code are left
 * alone, and every other character of the file is kept.
 */

/** `[[target#part|alias]]`, optionally with a leading `!`. */
const WIKI = /(!?)\[\[([^[\]\n|#^]+)([#^][^[\]\n|]*)?(\|[^[\]\n]+)?\]\]/g;

/** A fence line: three or more backticks or tildes, up to three spaces in. */
const FENCE = /^ {0,3}(`{3,}|~{3,})/;

/** Inline code: a run of backticks, then the same run again. */
const INLINE_CODE = /(`+)[\s\S]*?\1/g;

export interface RewriteResult {
  text: string;
  /** How many links changed. */
  count: number;
}

/**
 * Calls `change` with each link's target (without `#heading` or alias)
 * and writes back what it returns; null keeps the link as it is.
 */
export function rewriteLinks(
  text: string,
  change: (target: string) => string | null,
): RewriteResult {
  let count = 0;

  const rewritePlain = (segment: string): string =>
    segment.replace(
      WIKI,
      (
        whole,
        bang: string,
        target: string,
        part: string | undefined,
        alias: string | undefined,
        offset: number,
        all: string,
      ) => {
        // An escaped `\[\[...]]` is text, not a link.
        if (offset > 0 && all[offset - 1] === '\\') return whole;
        const next = change(target.trim());
        if (next === null || next === target.trim()) return whole;
        count += 1;
        return `${bang}[[${next}${part ?? ''}${alias ?? ''}]]`;
      },
    );

  const rewriteLine = (line: string): string => {
    let out = '';
    let last = 0;
    for (const m of line.matchAll(INLINE_CODE)) {
      out += rewritePlain(line.slice(last, m.index)) + m[0];
      last = m.index + m[0].length;
    }
    return out + rewritePlain(line.slice(last));
  };

  // Split keeping line endings, so the file comes back byte for byte.
  const lines = text.split(/(?<=\n)/);
  let fence: string | null = null;
  const out = lines.map((line) => {
    const opener = FENCE.exec(line)?.[1];
    if (fence !== null) {
      if (opener !== undefined && opener[0] === fence[0] && opener.length >= fence.length) {
        fence = null;
      }
      return line;
    }
    if (opener !== undefined) {
      fence = opener;
      return line;
    }
    return rewriteLine(line);
  });
  return { text: out.join(''), count };
}
