import { inReadingOrder, layout, letter, sourceRect, type Figure, type Layout } from './model';
import { imageToBox } from './marks';
import { drawRich, parseRich } from './richText';

/** An image ready to draw, with its own size in pixels. */
export interface Source {
  image: CanvasImageSource;
  w: number;
  h: number;
}

export interface RenderOptions {
  /** Pixels per millimetre. */
  scale: number;
  /** Each panel's image as it is to be shown, by panel id. */
  sources: ReadonlyMap<string, Source>;
  /** Draw the empty panels' outlines and hints: on screen, not in an export. */
  editing: boolean;
  /** The panel to outline as chosen, on screen. */
  selected?: string | null;
  /** The mark to outline as chosen, on screen. */
  selectedMark?: string | null;
  font: string;
  accent?: string;
}

const POINT = 25.4 / 72;

/** Draws one panel's image, cropped, turned and flipped, into its box (in px). */
function drawImage(
  c: CanvasRenderingContext2D,
  source: Source,
  box: { x: number; y: number; w: number; h: number },
  crop: Figure['panels'][number]['image'],
) {
  if (!crop) return;
  const r = sourceRect({ w: source.w, h: source.h }, box, crop.crop);
  c.save();
  c.beginPath();
  c.rect(box.x, box.y, box.w, box.h);
  c.clip();
  c.translate(box.x + box.w / 2, box.y + box.h / 2);
  c.rotate((crop.crop.turns * Math.PI) / 2);
  if (crop.crop.flip) c.scale(-1, 1);
  const turned = crop.crop.turns % 2 === 1;
  const w = turned ? box.h : box.w;
  const h = turned ? box.w : box.h;
  c.imageSmoothingQuality = 'high';
  c.drawImage(source.image, r.x, r.y, r.w, r.h, -w / 2, -h / 2, w, h);
  c.restore();
}

/** Draws the whole figure on a white page, at `scale` pixels per mm. */
export function drawFigure(c: CanvasRenderingContext2D, figure: Figure, o: RenderOptions): Layout {
  const l = layout(figure);
  const s = o.scale;
  c.save();
  c.fillStyle = '#ffffff';
  c.fillRect(0, 0, l.width * s, l.height * s);
  const order = inReadingOrder(figure.panels).map((p) => p.id);

  for (const p of l.panels) {
    const box = { x: p.x * s, y: p.y * s, w: p.w * s, h: p.h * s };
    const image = p.panel.image;
    const source = image ? o.sources.get(p.panel.id) : undefined;
    if (image && source) {
      drawImage(c, source, box, image);
    } else if (o.editing) {
      c.fillStyle = '#eef1f0';
      c.fillRect(box.x, box.y, box.w, box.h);
      c.fillStyle = '#7b8784';
      c.font = `${String(Math.max(10, Math.min(14, box.w / 9)))}px ${o.font}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(image ? 'Opening…' : 'Drop an image', box.x + box.w / 2, box.y + box.h / 2);
    }
    if (image && source) {
      const natural = { w: source.w, h: source.h };
      // A zoomed inset: its region outlined, and drawn larger in a corner.
      const inset = p.panel.inset;
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
          const line = Math.max(1, 0.25 * s);
          c.strokeStyle = inset.colour;
          c.lineWidth = line;
          c.strokeRect(region.x, region.y, region.w, region.h);
          const w = box.w * inset.size;
          const h = (w * region.h) / Math.max(1, region.w);
          const right = inset.corner.endsWith('right');
          const bottom = inset.corner.startsWith('bottom');
          const shown = {
            x: right ? box.x + box.w - w : box.x,
            y: bottom ? box.y + box.h - h : box.y,
            w,
            h,
          };
          // Its crop: centred on the region, zoomed so the region fills it.
          const turned = image.crop.turns % 2 === 1;
          const regionImageW = (inset.u1 - inset.u0) * natural.w;
          const regionImageH = (inset.v1 - inset.v0) * natural.h;
          const bw = turned ? shown.h : shown.w;
          const bh = turned ? shown.w : shown.h;
          const zoom =
            Math.max(bw / regionImageW, bh / regionImageH) /
            Math.max(bw / natural.w, bh / natural.h);
          drawImage(c, source, shown, {
            ...image,
            crop: {
              ...image.crop,
              zoom: Math.max(1, zoom),
              cx: (inset.u0 + inset.u1) / 2,
              cy: (inset.v0 + inset.v1) / 2,
            },
          });
          c.strokeStyle = inset.colour;
          c.lineWidth = line;
          c.strokeRect(shown.x + line / 2, shown.y + line / 2, shown.w - line, shown.h - line);
        }
      }
      for (const mark of p.panel.marks) {
        const at = imageToBox(mark.u, mark.v, natural, box, image.crop);
        if (!at) continue;
        drawMark(c, mark, at.x, at.y, mark.size * POINT * s, o.font);
        if (o.editing && o.selectedMark === mark.id) {
          c.strokeStyle = o.accent ?? '#2f5fb3';
          c.lineWidth = 1.5;
          c.setLineDash([3, 3]);
          c.strokeRect(at.x - 8, at.y - 8, 16, 16);
          c.setLineDash([]);
        }
      }
    }
    if (figure.letters.show && image) {
      const index = order.indexOf(p.panel.id);
      const text = letter(index, figure.letters.form);
      const size = figure.letters.size * POINT * s;
      const pad = size * 0.35;
      c.font = `bold ${String(size)}px ${o.font}`;
      c.fillStyle = figure.letters.colour;
      const right = figure.letters.corner.endsWith('right');
      const bottom = figure.letters.corner.startsWith('bottom');
      c.textAlign = right ? 'right' : 'left';
      c.textBaseline = bottom ? 'bottom' : 'top';
      c.fillText(
        text,
        right ? box.x + box.w - pad : box.x + pad,
        bottom ? box.y + box.h - pad : box.y + pad,
      );
    }
    // A scale bar, its length worked out from the pixel size and how far the image is zoomed.
    if (image && source && p.panel.scaleBar && image.umPerPx !== null) {
      const view = sourceRect({ w: source.w, h: source.h }, box, image.crop);
      const across = image.crop.turns % 2 === 1 ? view.h : view.w;
      const pxPerImagePx = box.w / across;
      const bar = (figure.scaleBar.um / image.umPerPx) * pxPerImagePx;
      if (bar > 2 && bar < box.w * 0.9) {
        const thick = Math.max(1, figure.scaleBar.thickness * s);
        const pad = Math.max(3, 1.5 * s);
        const right = figure.scaleBar.corner.endsWith('right');
        const bottom = figure.scaleBar.corner.startsWith('bottom');
        const x = right ? box.x + box.w - pad - bar : box.x + pad;
        const y = bottom ? box.y + box.h - pad - thick : box.y + pad;
        c.fillStyle = figure.scaleBar.colour;
        c.fillRect(x, y, bar, thick);
        if (figure.scaleBar.text) {
          const size = figure.channelSize * POINT * s;
          c.font = `bold ${String(size)}px ${o.font}`;
          c.textAlign = 'center';
          c.textBaseline = bottom ? 'bottom' : 'top';
          c.fillText(
            `${String(figure.scaleBar.um)} µm`,
            x + bar / 2,
            bottom ? y - size * 0.2 : y + thick + size * 0.2,
          );
        }
      }
    }
    // Channel or antibody names, in their colours, stacked in a corner.
    if (image && p.panel.labels.length > 0) {
      const size = figure.channelSize * POINT * s;
      const pad = size * 0.45;
      const right = figure.channelCorner.endsWith('right');
      const bottom = figure.channelCorner.startsWith('bottom');
      const lines = p.panel.labels.filter((l) => l.text.trim() !== '');
      lines.forEach((label, i) => {
        const runs = parseRich(label.text);
        c.fillStyle = label.colour;
        c.font = `bold ${String(size)}px ${o.font}`;
        const width = c.measureText(label.text).width;
        const row = bottom ? lines.length - 1 - i : i;
        const y = bottom
          ? box.y + box.h - pad - size * 0.5 - row * size * 1.2
          : box.y + pad + size * 0.5 + row * size * 1.2;
        const x = right ? box.x + box.w - pad - width / 2 : box.x + pad + width / 2;
        drawRich(
          c,
          runs.map((r) => ({ ...r, bold: true })),
          x,
          y,
          size,
          o.font,
          box.w - pad * 2,
        );
      });
    }
    if (o.editing && o.selected === p.panel.id) {
      c.strokeStyle = o.accent ?? '#2f5fb3';
      c.lineWidth = 2;
      c.strokeRect(box.x + 1, box.y + 1, box.w - 2, box.h - 2);
    }
  }
  // Labels round the grid, in black on the white page.
  const size = figure.labelSize * POINT * s;
  c.fillStyle = '#000000';
  c.strokeStyle = '#000000';
  for (const r of l.rowLabels) {
    const text = figure.rowLabels[r.row] ?? '';
    if (text.trim() === '' || r.w === 0) continue;
    c.save();
    c.translate((r.x + r.w / 2) * s, (r.y + r.h / 2) * s);
    c.rotate(-Math.PI / 2);
    drawRich(c, parseRich(text), 0, 0, size, o.font, r.h * s);
    c.restore();
  }
  for (const col of l.colLabels) {
    const text = figure.colLabels[col.col] ?? '';
    if (text.trim() === '' || col.h === 0) continue;
    drawRich(
      c,
      parseRich(text),
      (col.x + col.w / 2) * s,
      (col.y + col.h * 0.55) * s,
      size,
      o.font,
      col.w * s,
    );
  }
  for (const h of l.headers) {
    if (h.header.text.trim() === '') continue;
    drawRich(
      c,
      parseRich(h.header.text),
      (h.x + h.w / 2) * s,
      (h.y + h.h * 0.42) * s,
      size,
      o.font,
      h.w * s,
    );
    // A line under the header, over the columns it spans.
    c.lineWidth = Math.max(1, 0.25 * s);
    c.beginPath();
    const y = (h.y + h.h * 0.85) * s;
    c.moveTo((h.x + 0.5) * s, y);
    c.lineTo((h.x + h.w - 0.5) * s, y);
    c.stroke();
  }
  c.restore();
  return l;
}

/** The figure's typeface: what journals ask for, and the same in every export. */
export const FIGURE_FONT = 'Arial, Helvetica, "Liberation Sans", sans-serif';

/**
 * Draws a mark with its point at (x, y). An arrow's head is at the point
 * and its tail behind, the way it points; an arrowhead is the head alone.
 */
export function drawMark(
  c: CanvasRenderingContext2D,
  mark: Figure['panels'][number]['marks'][number],
  x: number,
  y: number,
  size: number,
  font: string,
): void {
  c.save();
  c.fillStyle = mark.colour;
  c.strokeStyle = mark.colour;
  const angle = (mark.angle * Math.PI) / 180;
  if (mark.kind === 'arrow' || mark.kind === 'arrowhead') {
    c.translate(x, y);
    c.rotate(angle);
    const head = size * 0.9;
    // Pointing along +x, so the tail is towards -x.
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(-head, -head * 0.45);
    c.lineTo(-head * 0.78, 0);
    c.lineTo(-head, head * 0.45);
    c.closePath();
    c.fill();
    if (mark.kind === 'arrow') {
      c.lineWidth = Math.max(1, size * 0.14);
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(-head * 0.8, 0);
      c.lineTo(-size * 2.6, 0);
      c.stroke();
    }
  } else if (mark.kind === 'star') {
    c.font = `bold ${String(size * 1.6)}px ${font}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('*', x, y + size * 0.3);
  } else if (mark.text.trim() !== '') {
    drawRich(c, parseRich(mark.text), x, y, size, font);
  }
  c.restore();
}

/** Pixels per mm for a resolution in dots per inch. */
export const perMm = (dpi: number) => dpi / 25.4;
