import { runFont, type Run } from './richText';

/** The figure's typeface: what journals ask for, and the same in every export. */
export const FIGURE_FONT = 'Arial, Helvetica, "Liberation Sans", sans-serif';

let measurer: CanvasRenderingContext2D | null = null;

/** How wide text is, in mm, at a size in mm. */
export function textWidth(runs: readonly Run[], size: number): number {
  measurer ??= document.createElement('canvas').getContext('2d');
  if (!measurer) return runs.reduce((w, r) => w + r.text.length * size * 0.55, 0);
  // Measured at 100 px to the mm, for precision.
  let width = 0;
  for (const run of runs) {
    measurer.font = runFont(run, size * 100, FIGURE_FONT);
    width += measurer.measureText(run.text).width;
  }
  return width / 100;
}
