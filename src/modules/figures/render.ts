import type { FigureDoc } from './doc';
import { runFont, runRise } from './richText';
import {
  buildScene,
  FIGURE_FONT,
  textWidth,
  type Prim,
  type Scene,
  type PageOptions,
  type Source,
} from './scene';

export { FIGURE_FONT, type Source };

export interface RenderOptions extends PageOptions {
  /** Pixels per millimetre. */
  scale: number;
}

/** Draws a scene on a canvas at `s` pixels per mm. */
export function drawScene(c: CanvasRenderingContext2D, scene: Scene, s: number): void {
  for (const p of scene.prims) drawPrim(c, p, s);
}

function drawPrim(c: CanvasRenderingContext2D, p: Prim, s: number): void {
  c.save();
  switch (p.kind) {
    case 'image':
      p.paint(c, { x: p.box.x * s, y: p.box.y * s, w: p.box.w * s, h: p.box.h * s });
      break;
    case 'rect': {
      const x = p.box.x * s,
        y = p.box.y * s,
        w = p.box.w * s,
        h = p.box.h * s;
      if (p.fill) {
        c.fillStyle = p.fill;
        c.fillRect(x, y, w, h);
      }
      if (p.stroke) {
        c.strokeStyle = p.stroke;
        c.lineWidth = Math.max(1, (p.width ?? 0.25) * s);
        if (p.dash) c.setLineDash([3, 3]);
        c.strokeRect(x, y, w, h);
      }
      break;
    }
    case 'poly':
      c.beginPath();
      p.points.forEach(([x, y], i) => {
        if (i === 0) c.moveTo(x * s, y * s);
        else c.lineTo(x * s, y * s);
      });
      c.closePath();
      if (p.fill) {
        c.fillStyle = p.fill;
        c.fill();
      }
      if (p.stroke) {
        c.strokeStyle = p.stroke;
        c.lineWidth = Math.max(1, (p.width ?? 0.25) * s);
        c.stroke();
      }
      break;
    case 'line':
      c.strokeStyle = p.stroke;
      c.lineWidth = Math.max(1, p.width * s);
      c.lineCap = p.round ? 'round' : 'butt';
      c.beginPath();
      c.moveTo(p.from[0] * s, p.from[1] * s);
      c.lineTo(p.to[0] * s, p.to[1] * s);
      c.stroke();
      break;
    case 'text': {
      const size = p.size * s;
      const width = textWidth(p.runs, p.size) * s;
      c.translate(p.x * s, p.y * s);
      if (p.rotate) c.rotate((-p.rotate * Math.PI) / 180);
      let at = p.align === 'left' ? 0 : p.align === 'right' ? -width : -width / 2;
      c.fillStyle = p.colour;
      c.textAlign = 'left';
      c.textBaseline = 'middle';
      for (const run of p.runs) {
        c.font = runFont(run, size, FIGURE_FONT);
        c.fillText(run.text, at, -runRise(run, size));
        at += c.measureText(run.text).width;
      }
      break;
    }
  }
  c.restore();
}

/** Draws the whole figure on a white page, at `scale` pixels per mm. */
export function drawFigure(c: CanvasRenderingContext2D, doc: FigureDoc, o: RenderOptions): void {
  drawScene(c, buildScene(doc, o), o.scale);
}

/** Pixels per mm for a resolution in dots per inch. */
export const perMm = (dpi: number) => dpi / 25.4;
