import { sourceRect, type Box, type Crop } from './model';

/**
 * Where a point in an image appears in its panel, and back. Image points
 * are shares of the image (0 to 1 across and down), so marks and insets
 * stay on the same cell however the image is cropped, zoomed or turned.
 */

/** A point in the image (shares) to a point in the box (its own units), or null if outside the view. */
export function imageToBox(
  u: number,
  v: number,
  natural: { w: number; h: number },
  box: Box,
  crop: Crop,
): { x: number; y: number } | null {
  const r = sourceRect(natural, box, crop);
  // Where it is in the visible part, as shares of that part.
  let a = (u * natural.w - r.x) / r.w;
  let b = (v * natural.h - r.y) / r.h;
  if (a < 0 || b < 0 || a > 1 || b > 1) return null;
  // Then the flip and the turn, as the picture is drawn.
  if (crop.flip) a = 1 - a;
  for (let i = 0; i < crop.turns; i += 1) [a, b] = [1 - b, a];
  return { x: box.x + a * box.w, y: box.y + b * box.h };
}

/** A point in the box (its own units) to the image point (shares) under it. */
export function boxToImage(
  x: number,
  y: number,
  natural: { w: number; h: number },
  box: Box,
  crop: Crop,
): { u: number; v: number } {
  let a = (x - box.x) / box.w;
  let b = (y - box.y) / box.h;
  for (let i = 0; i < crop.turns; i += 1) [a, b] = [b, 1 - a];
  if (crop.flip) a = 1 - a;
  const r = sourceRect(natural, box, crop);
  return { u: (r.x + a * r.w) / natural.w, v: (r.y + b * r.h) / natural.h };
}
