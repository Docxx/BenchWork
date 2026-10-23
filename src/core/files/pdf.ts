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
    destroy() {
      void task.destroy();
    },
  };
}
