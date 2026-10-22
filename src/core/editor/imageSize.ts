/**
 * Image sizes, written the way Obsidian writes them so both apps agree:
 * `![[plot.png|300]]` or `![[plot.png|caption|300]]` for embeds, and
 * `![caption|300](plot.png)` for Markdown images. `|300x200` gives a height
 * too. The size is in CSS pixels; the image file is never changed.
 */

export interface ImageSize {
  width: number;
  height: number | null;
}

/** Images are never made narrower than this. */
export const MIN_WIDTH = 48;
/** Each Smaller or Larger step changes the width by this factor. */
export const STEP = 1.25;

const SIZE = /^(\d{1,5})(?:x(\d{1,5}))?$/;

/** Reads `300` or `300x200`; null for anything else, including 0. */
export function parseSize(text: string): ImageSize | null {
  const m = SIZE.exec(text.trim());
  if (!m) return null;
  const width = Number(m[1]);
  const height = m[2] === undefined ? null : Number(m[2]);
  if (width === 0 || height === 0) return null;
  return { width, height };
}

export function formatSize(size: ImageSize): string {
  return size.height === null ? String(size.width) : `${String(size.width)}x${String(size.height)}`;
}

/** Splits `caption|300` into its caption and size. Text without a size is all caption. */
export function splitLabel(label: string | null): { caption: string; size: ImageSize | null } {
  const text = label ?? '';
  const bar = text.lastIndexOf('|');
  const size = parseSize(bar === -1 ? text : text.slice(bar + 1));
  if (size === null) return { caption: text, size: null };
  return { caption: bar === -1 ? '' : text.slice(0, bar), size };
}

/** The reverse of splitLabel. Null when there is neither caption nor size. */
export function joinLabel(caption: string, size: ImageSize | null): string | null {
  if (size === null) return caption === '' ? null : caption;
  return caption === '' ? formatSize(size) : `${caption}|${formatSize(size)}`;
}

/** A width kept between MIN_WIDTH and `max`, in whole pixels. */
export function clampWidth(width: number, max: number): number {
  return Math.round(Math.min(Math.max(width, MIN_WIDTH), Math.max(max, MIN_WIDTH)));
}

/** The width one Smaller (-1) or Larger (+1) step from `width`. */
export function stepWidth(width: number, direction: -1 | 1, max: number): number {
  return clampWidth(direction > 0 ? width * STEP : width / STEP, max);
}
