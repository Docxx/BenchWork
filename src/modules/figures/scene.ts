import { imageToBox } from './marks';
import {
  inReadingOrder,
  letter,
  sourceRect,
  type Box,
  type Corner,
  type Grid,
  type Layout,
  type Mark,
  type PanelImage,
  POINT,
} from './model';
import { blotPrims, tablePrims } from './blot';
import { layoutDoc, type FigureDoc, type TextBox } from './doc';
import { fitIn, shownRect, type Graphic, type GraphicSource, type Trim } from './graphic';
import { textWidth } from './measure';
import { parseRich, type Run } from './richText';
import { shapePrims } from './shapes';
import type { Edges, Guide } from './snap';

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
  | {
      kind: 'image';
      box: Box;
      paint: Paint;
      /** A graph drawn from an SVG: kept as shapes and text in an SVG export. */
      svg?: { markup: string; viewBox: [number, number, number, number]; trim: Trim };
      /** Line art: drawn at no less than 600 dpi in a PDF. */
      sharp?: boolean;
    }
  | { kind: 'rect'; box: Box; fill?: string; stroke?: string; width?: number; dash?: boolean }
  | { kind: 'poly'; points: [number, number][]; fill?: string; stroke?: string; width?: number }
  | {
      kind: 'line';
      from: [number, number];
      to: [number, number];
      stroke: string;
      width: number;
      round?: boolean;
      dash?: boolean;
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
}

export interface SceneOptions {
  /** Each panel's image as it is to be shown, by panel id. */
  sources: ReadonlyMap<string, Source>;
  /** With the editing hints and outlines: on screen, not in an export. */
  editing: boolean;
  selectedPanels?: readonly string[];
  /** Each graph part's picture, by block id. */
  graphics?: ReadonlyMap<string, GraphicSource>;
  selectedMark?: string | null;
  accent?: string;
}

export { FIGURE_FONT, textWidth } from './measure';

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

/** What a grid draws, in mm, laid out where `l` says. */
export function gridPrims(figure: Grid, l: Layout, o: SceneOptions): Prim[] {
  const prims: Prim[] = [];
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
    if (o.editing && (o.selectedPanels ?? []).includes(panel.id)) {
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
  // Labels beside groups of rows, with a line along the rows, reading
  // upwards on the left and downwards on the right.
  for (const h of l.rowHeaders) {
    if (h.header.text.trim() === '' || h.w === 0) continue;
    const left = figure.rowHeaderSide === 'left';
    const runs = parseRich(h.header.text);
    prims.push({
      kind: 'text',
      runs,
      x: h.x + h.w * (left ? 0.42 : 0.58),
      y: h.y + h.h / 2,
      size: fitted(runs, size, h.h),
      colour: '#000000',
      align: 'center',
      rotate: left ? 90 : -90,
    });
    const x = h.x + h.w * (left ? 0.85 : 0.15);
    prims.push({
      kind: 'line',
      from: [x, h.y + 0.5],
      to: [x, h.y + h.h - 0.5],
      stroke: '#000000',
      width: 0.25,
    });
  }
  return prims;
}

// ---- The page ----

/** Neighbouring runs in the same style joined, so text stays whole when exported. */
function joinRuns(runs: Run[]): Run[] {
  const out: Run[] = [];
  for (const r of runs) {
    const last = out.at(-1);
    if (last && last.bold === r.bold && last.italic === r.italic && last.shift === r.shift)
      out[out.length - 1] = { ...last, text: last.text + r.text };
    else out.push(r);
  }
  return out;
}

/** Text broken into lines that fit a width, each a list of runs. Lines in the text are kept. */
export function wrapText(text: string, size: number, maxWidth: number): Run[][] {
  const lines: Run[][] = [];
  for (const paragraph of text.split('\n')) {
    const words: Run[] = [];
    for (const run of parseRich(paragraph)) {
      for (const piece of run.text.split(/(\s+)/)) {
        if (piece !== '') words.push({ ...run, text: piece });
      }
    }
    let line: Run[] = [];
    let width = 0;
    for (const word of words) {
      const w = textWidth([word], size);
      const space = word.text.trim() === '';
      if (!space && line.length > 0 && width + w > maxWidth) {
        while (line.length > 0 && (line.at(-1)?.text.trim() ?? 'x') === '') line.pop();
        lines.push(joinRuns(line));
        line = [];
        width = 0;
      }
      if (space && line.length === 0) continue;
      line.push(word);
      width += w;
    }
    lines.push(joinRuns(line));
  }
  return lines;
}

/** What a text box draws, inside its box. */
export function textPrims(t: TextBox, box: Box): Prim[] {
  const size = t.size * POINT;
  const lineHeight = size * 1.25;
  const along = t.upright ? box.h : box.w;
  const lines = wrapText(t.text, size, Math.max(1, along - size * 0.2));
  return lines.flatMap((runs, i): Prim[] => {
    if (runs.length === 0) return [];
    const across = size * 0.6 + i * lineHeight;
    if (!t.upright) {
      const x =
        t.align === 'left' ? box.x : t.align === 'right' ? box.x + box.w : box.x + box.w / 2;
      return [{ kind: 'text', runs, x, y: box.y + across, size, colour: t.colour, align: t.align }];
    }
    // Reading upwards: the first line at the left, the start at the bottom.
    const y = t.align === 'left' ? box.y + box.h : t.align === 'right' ? box.y : box.y + box.h / 2;
    return [
      {
        kind: 'text',
        runs,
        x: box.x + across,
        y,
        size,
        colour: t.colour,
        align: t.align,
        rotate: 90,
      },
    ];
  });
}

/** What a graph draws: its trimmed part, as large as fits its box. */
function graphicPrims(g: Graphic, box: Box, o: SceneOptions, id: string): Prim[] {
  const source = o.graphics?.get(id);
  if (!source) {
    if (!o.editing) return [];
    return [
      { kind: 'rect', box, fill: '#eef1f0' },
      {
        kind: 'text',
        runs: parseRich('Opening the graph…'),
        x: box.x + box.w / 2,
        y: box.y + box.h / 2,
        size: Math.min(4, Math.max(2.2, box.w / 14)),
        colour: '#7b8784',
        align: 'center',
      },
    ];
  }
  const shown = shownRect(source, g.trim);
  const at = fitIn(shown, box);
  return [
    {
      kind: 'image',
      box: at,
      paint: (c, to) => {
        c.save();
        c.imageSmoothingQuality = 'high';
        c.drawImage(source.image, shown.x, shown.y, shown.w, shown.h, to.x, to.y, to.w, to.h);
        c.restore();
      },
      ...(source.svg ? { svg: { ...source.svg, trim: g.trim } } : {}),
      sharp: true,
    },
  ];
}

/** The handles a chosen block is resized by, and the one it is moved by, in mm. */
export function handlesOf(box: Box, size: number) {
  const { x, y, w, h } = box;
  const at = (hx: number, hy: number, edges: Edges) => ({
    box: { x: hx - size / 2, y: hy - size / 2, w: size, h: size },
    edges,
  });
  return {
    resize: [
      at(x, y, { left: true, top: true }),
      at(x + w / 2, y, { top: true }),
      at(x + w, y, { right: true, top: true }),
      at(x + w, y + h / 2, { right: true }),
      at(x + w, y + h, { right: true, bottom: true }),
      at(x + w / 2, y + h, { bottom: true }),
      at(x, y + h, { left: true, bottom: true }),
      at(x, y + h / 2, { left: true }),
    ],
    move: { x: x + w / 2, y: y - size * 2.2, r: size * 0.75 },
  };
}

export interface PageOptions extends SceneOptions {
  selectedBlock?: string | null;
  guides?: readonly Guide[];
  /** Handle size, mm, so handles look the same at any zoom. */
  handle?: number;
}

/** Everything the figure draws, in mm, on a white page. */
export function buildScene(doc: FigureDoc, o: PageOptions): Scene {
  const l = layoutDoc(doc);
  const height = l.height;
  const prims: Prim[] = [
    { kind: 'rect', box: { x: 0, y: 0, w: doc.width, h: height }, fill: '#ffffff' },
  ];
  const accent = o.accent ?? '#2f5fb3';
  const letterSize = doc.letters.size * POINT;
  for (const b of l.blocks) {
    if (b.block.kind === 'grid' && b.grid) {
      prims.push(...gridPrims(b.block.grid, b.grid, o));
      if (b.block.blot && b.blot)
        prims.push(...blotPrims(b.block.blot, b.blot, b.block.grid.labelSize * POINT));
    }
    if (b.block.kind === 'graphic')
      prims.push(...graphicPrims(b.block.graphic, b.content, o, b.block.id));
    if (b.block.kind === 'table') prims.push(...tablePrims(b.block.table, b.content));
    if (b.block.kind === 'shape') prims.push(...shapePrims(b.block.shape, b.content));
    if (b.block.kind === 'text') {
      if (b.block.text.text.trim() === '' && o.editing) {
        prims.push({ kind: 'rect', box: b.content, stroke: '#9aa5a2', width: 0.2, dash: true });
      } else prims.push(...textPrims(b.block.text, b.content));
    }
    if (b.letter) {
      prims.push({
        kind: 'text',
        runs: parseRich(b.letter.text).map((r) => ({ ...r, bold: true })),
        x: b.letter.x,
        y: b.letter.y,
        size: letterSize,
        colour: '#000000',
        align: 'left',
      });
    }
  }
  if (o.editing) {
    for (const g of o.guides ?? []) {
      prims.push({
        kind: 'line',
        from: g.axis === 'x' ? [g.at, 0] : [0, g.at],
        to: g.axis === 'x' ? [g.at, height] : [doc.width, g.at],
        stroke: '#e0457b',
        width: 0.2,
      });
    }
    const chosen = l.blocks.find((b) => b.block.id === o.selectedBlock);
    if (chosen) {
      const size = o.handle ?? 2;
      prims.push({ kind: 'rect', box: chosen.box, stroke: accent, width: size * 0.12, dash: true });
      const handles = handlesOf(chosen.box, size);
      for (const hd of handles.resize)
        prims.push({
          kind: 'rect',
          box: hd.box,
          fill: '#ffffff',
          stroke: accent,
          width: size * 0.15,
        });
      const m = handles.move;
      prims.push({
        kind: 'line',
        from: [m.x, m.y + m.r],
        to: [m.x, chosen.box.y],
        stroke: accent,
        width: size * 0.12,
      });
      const n = 12;
      prims.push({
        kind: 'poly',
        points: Array.from({ length: n }, (_x, i): [number, number] => [
          m.x + m.r * Math.cos((i / n) * Math.PI * 2),
          m.y + m.r * Math.sin((i / n) * Math.PI * 2),
        ]),
        fill: accent,
      });
    }
  }
  return { width: doc.width, height, prims };
}
