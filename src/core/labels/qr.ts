import bwip from 'bwip-js/browser';

/** A QR code as a square grid of modules; `true` is a dark module. */
export interface QrMatrix {
  size: number;
  dark: (x: number, y: number) => boolean;
}

/** Fewer printer dots than this per module and phone cameras start to struggle. */
export const MIN_DOTS_PER_MODULE = 3;
/** Blank margin around the code, in modules. The standard asks for 4; 2 scans well on labels. */
const QUIET = 2;

export function qrMatrix(text: string): QrMatrix {
  const [symbol] = bwip.raw('qrcode', text, 'eclevel=M');
  if (!symbol || !('pixs' in symbol)) throw new Error('This text cannot be made into a QR code.');
  const { pixs, pixx } = symbol;
  return { size: pixx, dark: (x, y) => pixs[y * pixx + x] === 1 };
}

export interface QrFit {
  /** Printer dots per module: each module prints as a whole square of dots. */
  dotsPerModule: number;
  /** Width of the printed code, quiet zone included, in printer dots. */
  dots: number;
  /** The smallest square, in mm, that gives MIN_DOTS_PER_MODULE. */
  minimumMm: number;
}

/** How a code of `modules` modules fits a square of `sideMm` at `dpi`. */
export function fitQr(modules: number, sideMm: number, dpi: number): QrFit {
  const span = modules + QUIET * 2;
  const available = Math.floor((sideMm * dpi) / 25.4);
  const dotsPerModule = Math.floor(available / span);
  return {
    dotsPerModule,
    dots: dotsPerModule * span,
    minimumMm: Math.ceil(((span * MIN_DOTS_PER_MODULE * 25.4) / dpi) * 10) / 10,
  };
}

/** Advice for the designer when a QR code is too small to scan, or `null` when it is fine. */
export function qrSizeWarning(text: string, sideMm: number, dpi: number): string | null {
  if (!text || /\{[^{}]+\}/.test(text)) return null;
  let modules: number;
  try {
    modules = qrMatrix(text).size;
  } catch {
    return null;
  }
  const fit = fitQr(modules, sideMm, dpi);
  if (fit.dotsPerModule >= MIN_DOTS_PER_MODULE) return null;
  return fit.dotsPerModule < 1
    ? `This QR code is too small to print. Make it at least ${String(fit.minimumMm)} mm square or use shorter text.`
    : `This QR code may not scan. Make it at least ${String(fit.minimumMm)} mm square or use shorter text.`;
}

/**
 * Draw a QR code onto a context already scaled to millimetres, so that every module
 * covers a whole number of printer dots and starts on a dot.
 */
export function drawQr(
  ctx: CanvasRenderingContext2D,
  text: string,
  sideMm: number,
  printerDpi: number,
): void {
  const matrix = qrMatrix(text);
  const fit = fitQr(matrix.size, sideMm, printerDpi);
  if (fit.dotsPerModule < 1)
    throw new Error('A QR code is too small to print. Make it larger or use shorter text.');
  // One canvas pixel per printer dot, scaled up without smoothing.
  const code = document.createElement('canvas');
  code.width = fit.dots;
  code.height = fit.dots;
  const c = code.getContext('2d');
  if (!c) throw new Error('Label drawing is unavailable.');
  c.fillStyle = 'white';
  c.fillRect(0, 0, fit.dots, fit.dots);
  c.fillStyle = 'black';
  const m = fit.dotsPerModule;
  for (let y = 0; y < matrix.size; y++)
    for (let x = 0; x < matrix.size; x++)
      if (matrix.dark(x, y)) c.fillRect((x + QUIET) * m, (y + QUIET) * m, m, m);
  // Snap the code's corner to a whole device pixel so modules do not straddle dots.
  const t = ctx.getTransform();
  ctx.setTransform(t.a, t.b, t.c, t.d, Math.round(t.e), Math.round(t.f));
  ctx.imageSmoothingEnabled = false;
  const mm = (fit.dots * 25.4) / printerDpi;
  ctx.drawImage(code, 0, 0, mm, mm);
}
