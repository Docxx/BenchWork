import { drawScene, perMm } from './render';
import { runRise, runSize, type Run } from './richText';
import { nestedSvg } from './graphic';
import { FIGURE_FONT, type Prim, type Scene } from './scene';
import { encodeTiff } from './tiffWrite';

/**
 * Exports a figure, from the same scene that is drawn on screen: as a PNG
 * or TIFF at a resolution, as an SVG (shapes and text kept editable), or as
 * a PDF (sharp text and shapes, with the images inside).
 */

export type ExportFormat = 'png' | 'tiff' | 'svg' | 'pdf';

/** The whole figure as pixels at a resolution, on its white page. */
export function rasterise(scene: Scene, dpi: number): HTMLCanvasElement {
  const s = perMm(dpi);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(scene.width * s);
  canvas.height = Math.round(scene.height * s);
  const c = canvas.getContext('2d');
  if (!c) throw new Error('This device could not draw the figure.');
  drawScene(c, scene, s);
  return canvas;
}

// ---- PNG, with its resolution written in, so it opens at its real size ----

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = (CRC_TABLE[(c ^ b) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Puts a pHYs chunk (pixels per metre) after a PNG's header chunk. */
export function withResolution(png: Uint8Array, dpi: number): Uint8Array {
  const perMetre = Math.round(dpi / 0.0254);
  const chunk = new Uint8Array(4 + 4 + 9 + 4);
  const v = new DataView(chunk.buffer);
  v.setUint32(0, 9);
  chunk.set([0x70, 0x48, 0x59, 0x73], 4); // pHYs
  v.setUint32(8, perMetre);
  v.setUint32(12, perMetre);
  chunk[16] = 1; // metres
  v.setUint32(17, crc32(chunk.subarray(4, 17)));
  // The signature is 8 bytes and the IHDR chunk 25; pHYs goes straight after.
  const at = 8 + 25;
  const out = new Uint8Array(png.length + chunk.length);
  out.set(png.subarray(0, at), 0);
  out.set(chunk, at);
  out.set(png.subarray(at), at + chunk.length);
  return out;
}

async function pngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/png');
  });
  if (!blob) throw new Error('The picture could not be made.');
  return new Uint8Array(await blob.arrayBuffer());
}

export async function toPng(scene: Scene, dpi: number): Promise<Uint8Array> {
  return withResolution(await pngBytes(rasterise(scene, dpi)), dpi);
}

export function toTiff(scene: Scene, dpi: number): Uint8Array {
  const canvas = rasterise(scene, dpi);
  const { data, width, height } = canvas
    .getContext('2d')
    ?.getImageData(0, 0, canvas.width, canvas.height) ?? {
    data: new Uint8ClampedArray(),
    width: 0,
    height: 0,
  };
  const rgb = new Uint8Array(width * height * 3);
  for (let i = 0; i < width * height; i += 1) {
    rgb[i * 3] = data[i * 4] ?? 0;
    rgb[i * 3 + 1] = data[i * 4 + 1] ?? 0;
    rgb[i * 3 + 2] = data[i * 4 + 2] ?? 0;
  }
  return encodeTiff([{ width, height, bits: 8, samples: 3, data: rgb }], {
    resolution: { perUnit: dpi, unit: 2 },
  });
}

/** An image prim's picture at a resolution, as a PNG data address. */
async function imageData(p: Extract<Prim, { kind: 'image' }>, dpi: number): Promise<string> {
  const s = perMm(dpi);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(p.box.w * s));
  canvas.height = Math.max(1, Math.round(p.box.h * s));
  const c = canvas.getContext('2d');
  if (!c) throw new Error('This device could not draw the figure.');
  p.paint(c, { x: 0, y: 0, w: canvas.width, h: canvas.height });
  const bytes = await pngBytes(canvas);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return `data:image/png;base64,${btoa(binary)}`;
}

// ---- SVG ----

const esc = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const n = (v: number) => String(Math.round(v * 1000) / 1000);
/** Dashes 1 mm long with 0.7 mm gaps, as on screen. */
const DASH = ' stroke-dasharray="1 0.7"';

function svgText(p: Extract<Prim, { kind: 'text' }>): string {
  const anchor = p.align === 'left' ? 'start' : p.align === 'right' ? 'end' : 'middle';
  const turn = p.rotate ? ` transform="rotate(${n(-p.rotate)} ${n(p.x)} ${n(p.y)})"` : '';
  const spans = p.runs
    .map((r: Run) => {
      const style = [
        r.italic ? 'font-style="italic"' : '',
        r.bold ? 'font-weight="bold"' : '',
        r.shift === 'none'
          ? ''
          : `font-size="${n(runSize(r, p.size))}" baseline-shift="${n(runRise(r, p.size))}"`,
      ]
        .filter((x) => x !== '')
        .join(' ');
      return `<tspan ${style}>${esc(r.text)}</tspan>`;
    })
    .join('');
  return `<text x="${n(p.x)}" y="${n(p.y)}" font-size="${n(p.size)}" fill="${p.colour}" text-anchor="${anchor}" dominant-baseline="central"${turn}>${spans}</text>`;
}

/** The figure as SVG, in mm: shapes and text as they are, images inside at `dpi`. */
export async function toSvg(scene: Scene, dpi = 300): Promise<string> {
  const parts: string[] = [];
  let graphs = 0;
  for (const p of scene.prims) {
    switch (p.kind) {
      case 'image':
        if (p.svg) {
          graphs += 1;
          parts.push(nestedSvg(p.svg, p.box, p.svg.trim, n, `g${String(graphs)}-`));
          break;
        }
        parts.push(
          `<image x=""${n(p.box.x)}" y="${n(p.box.y)}" width="${n(p.box.w)}" height="${n(p.box.h)}" preserveAspectRatio="none" href="${await imageData(p, dpi)}"/>`,
        );
        break;
      case 'rect':
        parts.push(
          `<rect x="${n(p.box.x)}" y="${n(p.box.y)}" width="${n(p.box.w)}" height="${n(p.box.h)}" fill="${p.fill ?? 'none'}"${p.stroke ? ` stroke="${p.stroke}" stroke-width="${n(p.width ?? 0.25)}"` : ''}${p.dash ? DASH : ''}/>`,
        );
        break;
      case 'poly':
        parts.push(
          `<polygon points="${p.points.map(([x, y]) => `${n(x)},${n(y)}`).join(' ')}" fill="${p.fill ?? 'none'}"${p.stroke ? ` stroke="${p.stroke}" stroke-width="${n(p.width ?? 0.25)}"` : ''}/>`,
        );
        break;
      case 'line':
        parts.push(
          `<line x1="${n(p.from[0])}" y1="${n(p.from[1])}" x2="${n(p.to[0])}" y2="${n(p.to[1])}" stroke="${p.stroke}" stroke-width="${n(p.width)}"${p.round ? ' stroke-linecap="round"' : ''}${p.dash ? DASH : ''}/>`,
        );
        break;
      case 'text':
        parts.push(svgText(p));
        break;
    }
  }
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n(scene.width)}mm" height="${n(scene.height)}mm" viewBox="0 0 ${n(scene.width)} ${n(scene.height)}" font-family="${esc(FIGURE_FONT)}">`,
    ...parts.map((x) => `  ${x}`),
    '</svg>',
    '',
  ].join('\n');
}

// ---- PDF ----

const rgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

/** The figure as a one-page PDF of its size: text and shapes sharp, images inside at `dpi`. */
export async function toPdf(scene: Scene, dpi = 300): Promise<Uint8Array> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({
    unit: 'mm',
    format: [scene.width, scene.height],
    orientation: scene.width > scene.height ? 'landscape' : 'portrait',
    compress: true,
  });
  const PT = 72 / 25.4;
  for (const p of scene.prims) {
    switch (p.kind) {
      case 'image':
        doc.addImage(
          // Line art from a graph is drawn finer, so its text and lines stay crisp.
          await imageData(p, p.sharp ? Math.max(dpi, 600) : dpi),
          'PNG',
          p.box.x,
          p.box.y,
          p.box.w,
          p.box.h,
          undefined,
          'FAST',
        );
        break;
      case 'rect': {
        if (p.fill) doc.setFillColor(...rgb(p.fill));
        if (p.stroke) {
          doc.setDrawColor(...rgb(p.stroke));
          doc.setLineWidth(p.width ?? 0.25);
        }
        doc.setLineDashPattern(p.dash ? [1, 0.7] : [], 0);
        doc.rect(
          p.box.x,
          p.box.y,
          p.box.w,
          p.box.h,
          p.fill && p.stroke ? 'FD' : p.fill ? 'F' : 'S',
        );
        doc.setLineDashPattern([], 0);
        break;
      }
      case 'poly': {
        const [first, ...rest] = p.points;
        if (!first) break;
        let [px, py] = first;
        const steps = rest.map(([x, y]) => {
          const step: [number, number] = [x - px, y - py];
          px = x;
          py = y;
          return step;
        });
        if (p.fill) doc.setFillColor(...rgb(p.fill));
        if (p.stroke) doc.setDrawColor(...rgb(p.stroke));
        doc.lines(steps, first[0], first[1], [1, 1], p.fill ? 'F' : 'S', true);
        break;
      }
      case 'line':
        doc.setDrawColor(...rgb(p.stroke));
        doc.setLineWidth(p.width);
        doc.setLineCap(p.round ? 'round' : 'butt');
        doc.setLineDashPattern(p.dash ? [1, 0.7] : [], 0);
        doc.line(p.from[0], p.from[1], p.to[0], p.to[1]);
        doc.setLineDashPattern([], 0);
        break;
      case 'text': {
        doc.setTextColor(...rgb(p.colour));
        const style = (r: Run) =>
          r.bold && r.italic ? 'bolditalic' : r.bold ? 'bold' : r.italic ? 'italic' : 'normal';
        const widthOf = (r: Run) => {
          doc.setFont('helvetica', style(r));
          doc.setFontSize(runSize(r, p.size) * PT);
          return doc.getTextWidth(r.text);
        };
        const total = p.runs.reduce((w, r) => w + widthOf(r), 0);
        let along = p.align === 'left' ? 0 : p.align === 'right' ? -total : -total / 2;
        const angle = ((p.rotate ?? 0) * Math.PI) / 180;
        // Along the text, and up from its middle line, turned with it.
        const place = (a: number, up: number): [number, number] => [
          p.x + a * Math.cos(angle) - up * Math.sin(angle),
          p.y - a * Math.sin(angle) - up * Math.cos(angle),
        ];
        for (const r of p.runs) {
          const w = widthOf(r);
          const [x, y] = place(along, runRise(r, p.size));
          doc.text(r.text, x, y, { baseline: 'middle', angle: p.rotate ?? 0 });
          along += w;
        }
        break;
      }
    }
  }
  return new Uint8Array(doc.output('arraybuffer'));
}
