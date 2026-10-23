/**
 * Draws PDF pages with pdf.js, loaded only when a PDF is first opened. The
 * file is only read: annotations, when they come, go in a sidecar file.
 */

export interface PdfDocument {
  pages: number;
  /** Draws page `n` (from 1) into `canvas`, `width` CSS pixels wide. */
  render(n: number, canvas: HTMLCanvasElement, width: number): Promise<void>;
  destroy(): void;
}

let configured: Promise<typeof import('pdfjs-dist')> | null = null;

function pdfjs(): Promise<typeof import('pdfjs-dist')> {
  configured ??= Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]).then(([lib, worker]) => {
    lib.GlobalWorkerOptions.workerSrc = worker.default;
    return lib;
  });
  return configured;
}

export async function openPdf(bytes: Uint8Array): Promise<PdfDocument> {
  const lib = await pdfjs();
  // pdf.js takes ownership of the buffer it is given, so it gets a copy.
  const task = lib.getDocument({ data: bytes.slice() });
  const doc = await task.promise;
  return {
    pages: doc.numPages,
    async render(n, canvas, width) {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const ratio = window.devicePixelRatio || 1;
      const viewport = page.getViewport({ scale: (width / base.width) * ratio });
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.style.width = `${String(Math.floor(viewport.width / ratio))}px`;
      canvas.style.height = `${String(Math.floor(viewport.height / ratio))}px`;
      await page.render({ canvas, viewport }).promise;
    },
    destroy() {
      void task.destroy();
    },
  };
}
