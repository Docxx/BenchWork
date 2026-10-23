/**
 * Reads CSV and TSV text for previews: quoted fields with commas, quotes
 * and line breaks inside, either line ending, and a delimiter worked out
 * from the first line when the file does not say.
 */

export interface TableData {
  /** Rows of cells, the first usually the header. At most the rows asked for. */
  rows: string[][];
  /** Rows in the whole file. */
  total: number;
}

const CANDIDATES = [',', ';', '\t'] as const;

/** The delimiter the first line uses most, outside quotes. Commas if none. */
export function guessDelimiter(text: string): string {
  const counts = new Map<string, number>(CANDIDATES.map((c) => [c, 0]));
  let quoted = false;
  for (const ch of text) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && (ch === '\n' || ch === '\r')) break;
    else if (!quoted && counts.has(ch)) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  }
  let best = ',';
  for (const c of CANDIDATES) if ((counts.get(c) ?? 0) > (counts.get(best) ?? 0)) best = c;
  return best;
}

/**
 * Parses up to `maxRows` rows and counts the rest. A blank last line is not
 * a row. A byte order mark at the start is dropped.
 */
export function parseCsv(input: string, maxRows: number, delimiter?: string): TableData {
  const text = input.startsWith('﻿') ? input.slice(1) : input;
  const sep = delimiter ?? guessDelimiter(text);
  const rows: string[][] = [];
  let total = 0;
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  /** Whether anything is in the current row yet. */
  let started = false;
  /** Whether the current cell has no characters yet, so a quote opens it. */
  let fresh = true;

  const endRow = () => {
    row.push(cell);
    if (total < maxRows) rows.push(row);
    total += 1;
    row = [];
    cell = '';
    started = false;
    fresh = true;
  };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text.charAt(i);
    // Rows past the limit are only counted, not kept.
    const keep = total < maxRows;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          if (keep) cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else if (keep) {
        cell += ch;
      }
      continue;
    }
    if (ch === '"' && fresh) {
      quoted = true;
      started = true;
      fresh = false;
    } else if (ch === sep) {
      row.push(cell);
      cell = '';
      started = true;
      fresh = true;
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      endRow();
    } else {
      if (keep) cell += ch;
      started = true;
      fresh = false;
    }
  }
  if (started) endRow();
  return { rows, total };
}
