/** Text set to fit its box: the size to print at and the lines it breaks into. */
export interface FittedText {
  size: number;
  lines: string[];
}

/** Smallest text size, in mm, that shrinking goes down to (about 2.3 pt). */
export const MIN_TEXT_MM = 0.8;

/** Breaks text into lines no wider than `width`, at spaces and the line breaks typed. */
export function wrapText(text: string, width: number, measure: (s: string) => number): string[] {
  return text.split('\n').flatMap((paragraph) => {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) return [''];
    const lines: string[] = [];
    let line = '';
    for (const word of words) {
      const next = line === '' ? word : `${line} ${word}`;
      if (line !== '' && measure(next) > width) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
    return lines;
  });
}

/**
 * The largest size, up to `size`, at which the text fits the box when
 * wrapped, so that all of it prints. `measure` gives a string's width at a
 * size, in the same units as the box.
 */
export function fitText(
  text: string,
  box: { width: number; height: number },
  size: number,
  lineSpacing: number,
  measure: (s: string, size: number) => number,
): FittedText {
  let s = size;
  for (;;) {
    const at = s;
    const lines = wrapText(text, box.width, (t) => measure(t, at));
    const tall = (lines.length - 1) * s * lineSpacing + s;
    const wide = Math.max(...lines.map((l) => measure(l, at)));
    if ((tall <= box.height && wide <= box.width) || s <= MIN_TEXT_MM) return { size: s, lines };
    s = Math.max(MIN_TEXT_MM, Math.round(s * 0.95 * 1000) / 1000);
  }
}
