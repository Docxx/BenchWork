import { inReadingOrder, layout, letter, sourceRect, type Figure, type Layout } from './model';

/** An image ready to draw, with its own size in pixels. */
export interface Source {
  image: CanvasImageSource;
  w: number;
  h: number;
}

export interface RenderOptions {
  /** Pixels per millimetre. */
  scale: number;
  /** Images that have loaded, by vault path. */
  sources: ReadonlyMap<string, Source>;
  /** Draw the empty panels' outlines and hints: on screen, not in an export. */
  editing: boolean;
  /** The panel to outline as chosen, on screen. */
  selected?: string | null;
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
    const source = image ? o.sources.get(image.path) : undefined;
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
    if (o.editing && o.selected === p.panel.id) {
      c.strokeStyle = o.accent ?? '#2f5fb3';
      c.lineWidth = 2;
      c.strokeRect(box.x + 1, box.y + 1, box.w - 2, box.h - 2);
    }
  }
  c.restore();
  return l;
}

/** Pixels per mm for a resolution in dots per inch. */
export const perMm = (dpi: number) => dpi / 25.4;
