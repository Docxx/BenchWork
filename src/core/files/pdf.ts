/**
 * Draws PDF pages with pdf.js, loaded only when a PDF is first opened. The
 * file is only read: annotations, when they come, go in a sidecar file.
 */

export interface PdfDocument {
  pages: number;
  /**
   * Draws page `n` (from 1) into `canvas`, `width` CSS pixels wide. A
   * canvas takes one drawing at a time, so cancel one that is no longer
   * wanted; `done` then resolves to false.
   */
  render(n: number, canvas: HTMLCanvasElement, width: number): PdfRender;
  /** Page `n`'s size in PDF points, at 100%. */
  size(n: number): Promise<{ width: number; height: number }>;
  /**
   * Lays page `n`'s text over it, invisible but selectable, in `container`
   * (which should sit over the page, `width` CSS pixels wide). Give the
   * container the class `pdf-text`.
   */
  text(n: number, container: HTMLElement, width: number): Promise<void>;
  destroy(): void;
}

export interface PdfRender {
  /** True once drawn; false if cancelled first. */
  done: Promise<boolean>;
  cancel(): void;
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
    render(n, canvas, width) {
      let cancelled = false;
      // Read through a function: cancel() changes it while this waits.
      const stopped = () => cancelled;
      let task: { cancel(): void } | null = null;
      const done = (async () => {
        const page = await doc.getPage(n);
        if (stopped()) return false;
        const base = page.getViewport({ scale: 1 });
        const ratio = window.devicePixelRatio || 1;
        const viewport = page.getViewport({ scale: (width / base.width) * ratio });
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = `${String(Math.floor(viewport.width / ratio))}px`;
        canvas.style.height = `${String(Math.floor(viewport.height / ratio))}px`;
        const rendering = page.render({ canvas, viewport });
        task = rendering;
        try {
          await rendering.promise;
          return true;
        } catch (err) {
          if (stopped()) return false;
          throw err;
        }
      })();
      return {
        done,
        cancel: () => {
          cancelled = true;
          task?.cancel();
        },
      };
    },
    async size(n) {
      const viewport = (await doc.getPage(n)).getViewport({ scale: 1 });
      return { width: viewport.width, height: viewport.height };
    },
    async text(n, container, width) {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: width / base.width });
      container.replaceChildren();
      container.style.setProperty('--total-scale-factor', String(viewport.scale));
      const layer = new lib.TextLayer({
        textContentSource: page.streamTextContent(),
        container,
        viewport,
      });
      await layer.render();
    },
    destroy() {
      void task.destroy();
    },
  };
}
