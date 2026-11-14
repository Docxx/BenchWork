import DOMPurify from 'dompurify';
import type { Box } from './model';

/**
 * A graph made elsewhere, such as in Prism, Excel or R, saved as SVG or
 * PDF. It sits whole in its part, its shape kept, with its edges trimmed
 * if wanted. An SVG stays as shapes and text in an SVG export; anything
 * else is drawn at the export's full resolution.
 */

export interface Trim {
  /** Shares of the graph cut off each edge. */
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Graphic {
  /** The file, as a vault path. */
  path: string;
  /** For a PDF, the page, from 1. */
  page: number;
  trim: Trim;
}

export const GRAPHIC_TYPES = /\.(svg|pdf)$/i;

export const NO_TRIM: Trim = { left: 0, top: 0, right: 0, bottom: 0 };

/** A graph ready to draw: a picture of it, its own size, and for an SVG its markup. */
export interface GraphicSource {
  image: CanvasImageSource;
  /** Its own size, in any unit: only the shape matters. */
  w: number;
  h: number;
  /** Cleaned SVG markup, with its view box, for an SVG export. */
  svg: { markup: string; viewBox: [number, number, number, number] } | null;
}

/** The part of the graph shown, in its own units, after trimming. */
export function shownRect(source: { w: number; h: number }, trim: Trim): Box {
  const x = source.w * trim.left;
  const y = source.h * trim.top;
  return {
    x,
    y,
    w: Math.max(source.w * 0.05, source.w * (1 - trim.left - trim.right)),
    h: Math.max(source.h * 0.05, source.h * (1 - trim.top - trim.bottom)),
  };
}

/** Where the shown part goes in a box: as large as fits, its shape kept, centred. */
export function fitIn(shown: { w: number; h: number }, box: Box): Box {
  const scale = Math.min(box.w / shown.w, box.h / shown.h);
  const w = shown.w * scale;
  const h = shown.h * scale;
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
}

let purifier: ReturnType<typeof DOMPurify> | null = null;

/** A cleaner of its own, whose links may only point within the same drawing. */
function cleaner(): ReturnType<typeof DOMPurify> {
  if (purifier) return purifier;
  const made = DOMPurify(window);
  made.addHook('uponSanitizeAttribute', (_node, data) => {
    if (data.attrName === 'href' || data.attrName === 'xlink:href') {
      if (!data.attrValue.trim().startsWith('#')) data.keepAttr = false;
    }
  });
  purifier = made;
  return made;
}

/**
 * An SVG file made safe and measured: scripts, links out and anything
 * that is not drawing are taken out. Null if it is not an SVG.
 */
export function cleanSvg(
  text: string,
): { markup: string; w: number; h: number; viewBox: [number, number, number, number] } | null {
  const clean = cleaner().sanitize(text, {
    USE_PROFILES: { svg: true, svgFilters: true },
    // Graphs draw their markers and letters by reusing shapes defined once.
    ADD_TAGS: ['use'],
    ADD_ATTR: ['xlink:href'],
    FORBID_TAGS: ['foreignObject', 'script'],
  });
  const parsed = new DOMParser().parseFromString(clean, 'image/svg+xml');
  const root = parsed.documentElement;
  if (root.nodeName.toLowerCase() !== 'svg') return null;
  const length = (v: string | null) => {
    const m = v ? /^\s*([\d.]+)\s*(px|pt|mm|cm|in)?\s*$/.exec(v) : null;
    if (!m) return null;
    const n = Number(m[1]);
    const unit = m[2] ?? 'px';
    const perPx = { px: 1, pt: 4 / 3, mm: 96 / 25.4, cm: 96 / 2.54, in: 96 }[unit] ?? 1;
    return n * perPx;
  };
  const box = (root.getAttribute('viewBox') ?? '')
    .split(/[\s,]+/)
    .map(Number)
    .filter((n) => Number.isFinite(n));
  const width = length(root.getAttribute('width'));
  const height = length(root.getAttribute('height'));
  let viewBox: [number, number, number, number];
  if (box.length === 4 && (box[2] ?? 0) > 0 && (box[3] ?? 0) > 0) {
    viewBox = [box[0] ?? 0, box[1] ?? 0, box[2] ?? 1, box[3] ?? 1];
  } else if (width && height) {
    viewBox = [0, 0, width, height];
  } else return null;
  // Drawn large, so a canvas copy is sharp at print sizes; the shape is the view box's.
  const scale = 4000 / Math.max(viewBox[2], viewBox[3]);
  const w = Math.round(viewBox[2] * scale);
  const h = Math.round(viewBox[3] * scale);
  root.setAttribute('viewBox', viewBox.join(' '));
  root.setAttribute('width', String(w));
  root.setAttribute('height', String(h));
  root.setAttribute('preserveAspectRatio', 'none');
  const markup = new XMLSerializer().serializeToString(root);
  return { markup, w, h, viewBox };
}

/** An SVG's markup as an image to draw on a canvas. */
export function svgImage(markup: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' }));
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('The SVG could not be drawn.'));
    };
    image.src = url;
  });
}

/**
 * The inside of an SVG export's nested drawing: the graph's own markup,
 * placed at a box in mm and showing only its trimmed part.
 */
export function nestedSvg(
  svg: { markup: string; viewBox: [number, number, number, number] },
  at: Box,
  trim: Trim,
  n: (v: number) => string,
  prefix: string,
): string {
  const [vx, vy, vw, vh] = svg.viewBox;
  const shown = shownRect({ w: vw, h: vh }, trim);
  const view = `${n(vx + shown.x)} ${n(vy + shown.y)} ${n(shown.w)} ${n(shown.h)}`;
  // Its ids are made its own, so two graphs from the same program do not clash.
  const own = svg.markup
    .replace(/\sid="([^"]+)"/g, ` id="${prefix}$1"`)
    .replace(/url\(\s*#([^)\s]+)\s*\)/g, `url(#${prefix}$1)`)
    .replace(/((?:xlink:)?href)="#([^"]+)"/g, `$1="#${prefix}$2"`);
  // The graph's own root becomes a nested drawing at the box.
  return own.replace(/^<svg\b[^>]*>/, (open) => {
    const kept = open
      .replace(/\s(x|y|width|height|viewBox|preserveAspectRatio)="[^"]*"/g, '')
      .replace(/^<svg/, '');
    return `<svg x="${n(at.x)}" y="${n(at.y)}" width="${n(at.w)}" height="${n(at.h)}" viewBox="${view}" preserveAspectRatio="none" overflow="hidden"${kept.replace(/>$/, '')}>`;
  });
}

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const share = (v: unknown) => (num(v) ? Math.min(0.45, Math.max(0, v)) : 0);

export function parseGraphic(raw: unknown): Graphic | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r['path'] !== 'string' || r['path'] === '') return null;
  const t = (r['trim'] && typeof r['trim'] === 'object' ? r['trim'] : {}) as Record<
    string,
    unknown
  >;
  return {
    path: r['path'],
    page: num(r['page']) ? Math.max(1, Math.floor(r['page'])) : 1,
    trim: {
      left: share(t['left']),
      top: share(t['top']),
      right: share(t['right']),
      bottom: share(t['bottom']),
    },
  };
}

/** A PDF page drawn as a canvas about `px` pixels wide. */
export async function pdfPicture(
  pdf: { render(n: number, canvas: HTMLCanvasElement, width: number): { done: Promise<boolean> } },
  page: number,
  px: number,
): Promise<GraphicSource> {
  const canvas = document.createElement('canvas');
  // The renderer multiplies by the screen's pixel ratio; this asks for pixels.
  const ratio = window.devicePixelRatio || 1;
  await pdf.render(page, canvas, Math.min(9000, px) / ratio).done;
  return { image: canvas, w: canvas.width, h: canvas.height, svg: null };
}

/** An SVG file's text as a graph ready to draw; null if it is not an SVG. */
export async function svgPicture(text: string): Promise<GraphicSource | null> {
  const svg = cleanSvg(text);
  if (!svg) return null;
  const image = await svgImage(svg.markup);
  return { image, w: svg.w, h: svg.h, svg: { markup: svg.markup, viewBox: svg.viewBox } };
}
