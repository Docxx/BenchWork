/**
 * Labels with a little styling, typed simply: `*elav*` in italics, `**A**`
 * in bold, `Myd88^KO^` with KO raised, `CO~2~` with 2 lowered. A marker
 * with nothing to close it is kept as typed. The same pieces are drawn on
 * screen and written into exports.
 */

export interface Run {
  text: string;
  italic: boolean;
  bold: boolean;
  /** Raised (superscript) or lowered (subscript). */
  shift: 'none' | 'sup' | 'sub';
}

const MARKERS = [
  { mark: '**', key: 'bold' },
  { mark: '*', key: 'italic' },
  { mark: '^', key: 'sup' },
  { mark: '~', key: 'sub' },
] as const;

/** A label's text in styled runs. */
export function parseRich(text: string): Run[] {
  const runs: Run[] = [];
  const state = { bold: false, italic: false, sup: false, sub: false };
  let buffer = '';
  const flush = () => {
    if (buffer === '') return;
    runs.push({
      text: buffer,
      bold: state.bold,
      italic: state.italic,
      shift: state.sup ? 'sup' : state.sub ? 'sub' : 'none',
    });
    buffer = '';
  };
  let i = 0;
  while (i < text.length) {
    if (text[i] === '\\' && i + 1 < text.length) {
      buffer += text[i + 1] ?? '';
      i += 2;
      continue;
    }
    const found = MARKERS.find(({ mark }) => text.startsWith(mark, i));
    if (found) {
      const { mark, key } = found;
      // Only a marker that is closed later, or that closes one, counts.
      const closes = state[key];
      const opens = !closes && text.indexOf(mark, i + mark.length) > i + mark.length;
      if (closes || opens) {
        flush();
        state[key] = !state[key];
        i += mark.length;
        continue;
      }
    }
    buffer += text[i] ?? '';
    i += 1;
  }
  flush();
  return runs;
}

/** The label's text with the markers taken out, for search and screen readers. */
export function plainText(text: string): string {
  return parseRich(text)
    .map((r) => r.text)
    .join('');
}

/** A run's font size: raised and lowered text is smaller. */
export const runSize = (run: Run, size: number) => (run.shift === 'none' ? size : size * 0.7);

/** A run's shift up the line, as a share of the size: up for raised, down for lowered. */
export const runRise = (run: Run, size: number) =>
  run.shift === 'sup' ? size * 0.38 : run.shift === 'sub' ? -size * 0.18 : 0;

export const runFont = (run: Run, size: number, family: string) =>
  `${run.italic ? 'italic ' : ''}${run.bold ? 'bold ' : ''}${String(runSize(run, size))}px ${family}`;
