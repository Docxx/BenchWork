import type { HandwritingRecognizer, InkStroke, ModuleContext } from '@core/api';

/**
 * Handwriting to text, with the device's recogniser (ML Kit on the
 * tablet). Strokes are given in the order written, each point with a time,
 * so the recogniser can follow the writing.
 */

/** A gap between strokes, as the recogniser sees it, in ms. */
const BETWEEN_STROKES_MS = 100;

/** Strokes as the recogniser takes them: points `[x, y, ms]`, times running on through the writing. */
export function toPoints(strokes: readonly InkStroke[]): [number, number, number][][] {
  let start = 0;
  return strokes.map((s) => {
    const points = s.points.map(([x, y, , t]): [number, number, number] => [x, y, start + t]);
    start += (s.points.at(-1)?.[3] ?? 0) + BETWEEN_STROKES_MS;
    return points;
  });
}

/**
 * Reads handwriting, downloading the language model the first time (about
 * 20 MB, once) with a message while it does.
 */
export function makeReader(
  ctx: ModuleContext,
  device: HandwritingRecognizer,
): (strokes: readonly InkStroke[]) => Promise<string> {
  let ready: Promise<void> | null = null;
  const prepare = () => {
    ready ??= (async () => {
      if (await device.ready()) return;
      ctx.app.notify('Getting handwriting to text ready: a one-off download of about 20 MB.');
      await device.prepare();
      ctx.app.notify('Handwriting to text is ready.');
    })().catch((err: unknown) => {
      // Tried again next time, such as when back online.
      ready = null;
      throw err;
    });
    return ready;
  };
  return async (strokes) => {
    const written = strokes.filter((s) => s.tool === 'pen' && s.points.length > 0);
    if (written.length === 0) return '';
    await prepare();
    return (await device.recognise(toPoints(written))).trim();
  };
}
