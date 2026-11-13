import { imageToBox } from './marks';
import {
  inReadingOrder,
  layout,
  letter,
  sourceRect,
  type Box,
  type Corner,
  type Figure,
  type Layout,
  type Mark,
  type PanelImage,
} from './model';
import { parseRich, runFont, type Run } from './richText';

/**
 * A figure as a list of things to draw, in millimetres: images, shapes and
 * text. The screen, PNG, TIFF, SVG and PDF all draw this same list, so an
 * export looks as the figure did while it was made.
 */

/** An image ready to draw, with its own size in pixels. */
export interface Source {
  image: CanvasImageSource;
  w: number;
  h: number;
}

/** Draws an image into a box of pixels; for a backend to call at its own resolution. */
export type Paint = (c: CanvasRenderingContext2D, box: Box) => void;

export type Prim =
  | { kind: 'image'; box: Box; paint: Paint }
  | { kind: 'rect'; box: Box; fill?: string; stroke?: string; width?: number; dash?: boolean }
  | { kind: 'poly'; points: [number, number][]; fill?: string; stroke?: string; width?: number }
  | {
      kind: 'line';
      from: [number, number];
      to: [number, number];
      stroke: string;
      width: number;
      round?: boolean;
    }
  | {
      kind: 'text';
      runs: Run[];
      /** Where the anchor is: the text's middle line, at its left, middle or right. */
      x: number;
      y: number;
      /** Text size, mm. */
      size: number;
      colour: string;
      align: 'left' | 'center' | 'right';
      /** Turned anticlockwise by this many degrees about (x, y). */
      rotate?: number;
    };

export interface Scene {
  width: number;
  height: number;
  prims: Prim[];
  layout: Layout;
}

export interface SceneOptions {
  /** Each panel's image as it is to be shown, by panel id. */
  sources: ReadonlyMap<string, Source>;
  /** With the editing hints and outlines: on screen, not in an export. */
  editing: boolean;
  selected?: string | null;
  selectedMark?: string | null;
  accent?: string;
}

/** The figure's typeface: what journals ask for, and the same in every export. */
export const FIGURE_FONT = 'Arial, Helvetica, "Liberation Sans", sans-serif';

export const POINT = 25.4 / 72;

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

/** Text at a size that fits a width: shrunk, down to half, if it would not. */
function fitted(runs: Run[], size: number, maxWidth: number): number {
  const width = textWidth(runs, size);
  return width > maxWidth && width > 0 ? Math.max(size * 0.5, (size * maxWidth) / width) : size;
}

/** Draws a panel's image, cropped, turned and flipped, into a box of pixels. */
export function paintImage(source: Source, image: PanelImage): Paint {
  return (c, box) => {
    const r = sourceRect({ w: source.w, h: source.h }, box, image.crop);
    c.save();
    c.beginPath();
    c.rect(box.x, box.y, box.w, box.h);
    c.clip();
    c.translate(box.x + box.w / 2, box.y + box.h / 2);
    c.rotate((image.crop.turns * Math.PI) / 2);
    if (image.crop.flip) c.scale(-1, 1);
    const turned = image.crop.turns % 2 === 1;
    const w = turned ? box.h : box.w;
    const h = turned ? box.w : box.h;
    c.imageSmoothingQuality = 'high';
    c.drawImage(source.image, r.x, r.y, r.w, r.h, -w / 2, -h / 2, w, h);
    c.restore();
  };
}

/** A point at a corner of a box, a little way in. */
function cornerAt(box: Box, corner: Corner, pad: number) {
  const right = corner.endsWith('right');
  const bottom = corner.startsWith('bottom');
  return {
    right,
    bottom,
    x: right ? box.x + box.w - pad : box.x + pad,
    y: bottom ? box.y + box.h - pad : box.y + pad,
  };
}

/** A mark's shapes, with its point at (x, y), at a size in mm. */
function markPrims(mark: Mark, x: number, y: number, size: number): Prim[] {
  const angle = (mark.angle * Math.PI) / 180;
  const cos = Math.cos(angle),
    sin = Math.sin(angle);
  // Along the way it points is +a; across it is +b.
  const at = (a: number, b: number): [number, number] => [
    x + a * cos - b * sin,
    y + a * sin + b * cos,
  ];
  if (mark.kind === 'arrow' || mark.kind === 'arrowhead') {
    const head = size * 0.9;
    const prims: Prim[] = [
      {
        kind: 'poly',
        points: [at(0, 0), at(-head, -head * 0.45), at(-head * 0.78, 0), at(-head, head * 0.45)],
        fill: mark.colour,
      },
    ];
    if (mark.kind === 'arrow') {
      prims.push({
        kind: 'line',
        from: at(-head * 0.8, 0),
        to: at(-size * 2.6, 0),
        stroke: mark.colour,
        width: Math.max(0.15, size * 0.14),
        round: true,
      });
    }
    return prims;
  }
  if (mark.kind === 'star') {
    return [
      {
        kind: 'text',
        runs: [{ text: '*', bold: true, italic: false, shift: 'none' }],
        x,
        y: y + size * 0.3,
        size: size * 1.6,
        colour: mark.colour,
        align: 'center',
      },
    ];
  }
  if (mark.text.trim() === '') return [];
  return [
    { kind: 'text', runs: parseRich(mark.text), x, y, size, colour: mark.colour, align: 'center' },
  ];
}

/** Everything the figure draws, in mm, on a white page. */
export function buildScene(figure: Figure, o: SceneOptions): Scene {
  const l = layout(figure);
  const prims: Prim[] = [
    { kind: 'rect', box: { x: 0, y: 0, w: l.width, h: l.height }, fill: '#ffffff' },
  ];
  const order = inReadingOrder(figure.panels).map((p) => p.id);
  const accent = o.accent ?? '#2f5fb3';

  for (const box of l.panels) {
    const panel = box.panel;
    const image = panel.image;
    const source = image ? o.sources.get(panel.id) : undefined;
    if (image && source) {
      prims.push({ kind: 'image', box, paint: paintImage(source, image) });
    } else if (o.editing) {
      prims.push({ kind: 'rect', box, fill: '#eef1f0' });
      prims.push({
        kind: 'text',
        runs: parseRich(image ? 'Opening…' : 'Drop an image'),
        x: box.x + box.w / 2,
        y: box.y + box.h / 2,
        size: Math.min(4, Math.max(2.2, box.w / 12)),
        colour: '#7b8784',
        align: 'center',
      });
    }

    if (image && source) {
      const natural = { w: source.w, h: source.h };
      // A zoomed inset: its region outlined, and drawn larger in a corner.
      const inset = panel.inset;
      if (inset) {
        const a = imageToBox(inset.u0, inset.v0, natural, box, image.crop);
        const b = imageToBox(inset.u1, inset.v1, natural, box, image.crop);
        if (a && b) {
          const region = {
            x: Math.min(a.x, b.x),
            y: Math.min(a.y, b.y),
            w: Math.abs(b.x - a.x),
            h: Math.abs(b.y - a.y),
          };
          const line = 0.25;
          prims.push({ kind: 'rect', box: region, stroke: inset.colour, width: line });
          const w = box.w * inset.size;
          const h = Math.min(box.h, (w * region.h) / Math.max(0.01, region.w));
          const right = inset.corner.endsWith('right');
          const bottom = inset.corner.startsWith('bottom');
          const shown = {
            x: right ? box.x + box.w - w : box.x,
            y: bottom ? box.y + box.h - h : box.y,
            w,
            h,
          };
          // Centred on the region, zoomed so the region fills it.
          const turned = image.crop.turns % 2 === 1;
          const bw = turned ? shown.h : shown.w;
          const bh = turned ? shown.w : shown.h;
          const zoom =
            Math.max(
              bw / ((inset.u1 - inset.u0) * natural.w),
              bh / ((inset.v1 - inset.v0) * natural.h),
            ) / Math.max(bw / natural.w, bh / natural.h);
          prims.push({
            kind: 'image',
            box: shown,
            paint: paintImage(source, {
              ...image,
              crop: {
                ...image.crop,
                zoom: Math.max(1, zoom),
                cx: (inset.u0 + inset.u1) / 2,
                cy: (inset.v0 + inset.v1) / 2,
              },
            }),
          });
          prims.push({
            kind: 'rect',
            box: {
              x: shown.x + line / 2,
              y: shown.y + line / 2,
              w: shown.w - line,
              h: shown.h - line,
            },
            stroke: inset.colour,
            width: line,
          });
        }
      }

      // A scale bar, its length from the pixel size and how far the image is zoomed.
      if (panel.scaleBar && image.umPerPx !== null) {
        const view = sourceRect(natural, box, image.crop);
        const across = image.crop.turns % 2 === 1 ? view.h : view.w;
        const bar = (figure.scaleBar.um / image.umPerPx) * (box.w / across);
        if (bar > 0.3 && bar < box.w * 0.9) {
          const thick = figure.scaleBar.thickness;
          const pad = 1.5;
          const c = cornerAt(box, figure.scaleBar.corner, pad);
          const x = c.right ? c.x - bar : c.x;
          const y = c.bottom ? c.y - thick : c.y;
          prims.push({
            kind: 'rect',
            box: { x, y, w: bar, h: thick },
            fill: figure.scaleBar.colour,
          });
          if (figure.scaleBar.text) {
            const size = figure.channelSize * POINT;
            prims.push({
              kind: 'text',
              runs: [
                {
                  text: `${String(figure.scaleBar.um)} µm`,
                  bold: true,
                  italic: false,
                  shift: 'none',
                },
              ],
              x: x + bar / 2,
              y: c.bottom ? y - size * 0.75 : y + thick + size * 0.75,
              size,
              colour: figure.scaleBar.colour,
              align: 'center',
            });
          }
        }
      }

      for (const mark of panel.marks) {
        const at = imageToBox(mark.u, mark.v, natural, box, image.crop);
        if (!at) continue;
        prims.push(...markPrims(mark, at.x, at.y, mark.size * POINT));
        if (o.editing && o.selectedMark === mark.id) {
          prims.push({
            kind: 'rect',
            box: { x: at.x - 2.5, y: at.y - 2.5, w: 5, h: 5 },
            stroke: accent,
            width: 0.3,
            dash: true,
          });
        }
      }

      // Channel or antibody names, in their colours, stacked in a corner.
      const names = panel.labels.filter((n) => n.text.trim() !== '');
      if (names.length > 0) {
        const size = figure.channelSize * POINT;
        const pad = size * 0.45;
        const c = cornerAt(box, figure.channelCorner, pad);
        names.forEach((name, i) => {
          const row = c.bottom ? names.length - 1 - i : i;
          const runs = parseRich(name.text).map((r) => ({ ...r, bold: true }));
          prims.push({
            kind: 'text',
            runs,
            x: c.x,
            y: c.bottom ? c.y - size * 0.5 - row * size * 1.2 : c.y + size * 0.5 + row * size * 1.2,
            size: fitted(runs, size, box.w - pad * 2),
            colour: name.colour,
            align: c.right ? 'right' : 'left',
          });
        });
      }
    }

    if (figure.letters.show && image) {
      const size = figure.letters.size * POINT;
      const c = cornerAt(box, figure.letters.corner, size * 0.35);
      prims.push({
        kind: 'text',
        runs: [
          {
            text: letter(order.indexOf(panel.id), figure.letters.form),
            bold: true,
            italic: false,
            shift: 'none',
          },
        ],
        x: c.x,
        y: c.bottom ? c.y - size * 0.5 : c.y + size * 0.5,
        size,
        colour: figure.letters.colour,
        align: c.right ? 'right' : 'left',
      });
    }
    if (o.editing && o.selected === panel.id) {
      prims.push({
        kind: 'rect',
        box: { x: box.x + 0.25, y: box.y + 0.25, w: box.w - 0.5, h: box.h - 0.5 },
        stroke: accent,
        width: 0.5,
      });
    }
  }

  // Labels round the grid, in black on the white page.
  const size = figure.labelSize * POINT;
  for (const r of l.rowLabels) {
    const text = figure.rowLabels[r.row] ?? '';
    if (text.trim() === '' || r.w === 0) continue;
    const runs = parseRich(text);
    prims.push({
      kind: 'text',
      runs,
      x: r.x + r.w / 2,
      y: r.y + r.h / 2,
      size: fitted(runs, size, r.h),
      colour: '#000000',
      align: 'center',
      rotate: 90,
    });
  }
  for (const col of l.colLabels) {
    const text = figure.colLabels[col.col] ?? '';
    if (text.trim() === '' || col.h === 0) continue;
    const runs = parseRich(text);
    prims.push({
      kind: 'text',
      runs,
      x: col.x + col.w / 2,
      y: col.y + col.h * 0.55,
      size: fitted(runs, size, col.w),
      colour: '#000000',
      align: 'center',
    });
  }
  for (const h of l.headers) {
    if (h.header.text.trim() === '') continue;
    const runs = parseRich(h.header.text);
    prims.push({
      kind: 'text',
      runs,
      x: h.x + h.w / 2,
      y: h.y + h.h * 0.42,
      size: fitted(runs, size, h.w),
      colour: '#000000',
      align: 'center',
    });
    // A rule under the header, over the columns it spans.
    const y = h.y + h.h * 0.85;
    prims.push({
      kind: 'line',
      from: [h.x + 0.5, y],
      to: [h.x + h.w - 0.5, y],
      stroke: '#000000',
      width: 0.25,
    });
  }
  return { width: l.width, height: l.height, prims, layout: l };
}
