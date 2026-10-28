import { useCallback, useEffect, useRef, useState } from 'react';
import type { InkAttachment, InkStroke, ModuleContext, PdfDocument } from '@core/api';
import { newStrokeId } from '@core/api';
import {
  emptyNotes,
  highlightBoxes,
  notesPath,
  pageNotes,
  parseNotes,
  scaleStrokes,
  serialiseNotes,
  withPage,
  type PdfHighlight,
  type PdfNotes,
} from './pdfNotes';

/** Wait after a change before writing the notes file, in ms. */
const SAVE_DELAY_MS = 600;
const ZOOMS = [0.5, 0.67, 0.8, 1, 1.25, 1.5, 2, 3];
const THUMB_WIDTH = 96;
const HIGHLIGHT = '#ffd84d';

type Mode = 'write' | 'select';

interface PageSize {
  width: number;
  height: number;
}

/** Whether the element has come near the screen, so it is worth drawing. */
function useNear(ref: React.RefObject<HTMLElement | null>, margin = '800px'): boolean {
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || near) return;
    if (typeof IntersectionObserver !== 'function') {
      const t = setTimeout(() => {
        setNear(true);
      }, 0);
      return () => {
        clearTimeout(t);
      };
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setNear(true);
      },
      { rootMargin: margin },
    );
    io.observe(el);
    return () => {
      io.disconnect();
    };
  }, [ref, near, margin]);
  return near;
}

function Thumb({
  doc,
  n,
  size,
  onGo,
}: {
  doc: PdfDocument;
  n: number;
  size: PageSize;
  onGo: (n: number) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const near = useNear(ref, '200px');
  useEffect(() => {
    if (!near || !canvas.current) return;
    const r = doc.render(n, canvas.current, THUMB_WIDTH);
    return () => {
      r.cancel();
    };
  }, [near, doc, n]);
  return (
    <button
      ref={ref}
      type="button"
      className="pdf-thumb"
      aria-label={`Page ${String(n)}`}
      onClick={() => {
        onGo(n);
      }}
      style={{ height: (THUMB_WIDTH * size.height) / size.width + 22 }}
    >
      <canvas ref={canvas} />
      <span>{n}</span>
    </button>
  );
}

function Page({
  ctx,
  doc,
  n,
  size,
  width,
  mode,
  notes,
  onInk,
  onHighlight,
  onRemoveHighlight,
}: {
  ctx: ModuleContext;
  doc: PdfDocument;
  n: number;
  size: PageSize;
  width: number;
  mode: Mode;
  notes: PdfNotes;
  onInk: (n: number, strokes: InkStroke[]) => void;
  onHighlight: (n: number, highlight: PdfHighlight) => void;
  onRemoveHighlight: (n: number, id: string) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const text = useRef<HTMLDivElement>(null);
  const ink = useRef<HTMLDivElement>(null);
  const attachment = useRef<InkAttachment | null>(null);
  const near = useNear(box);
  const scale = width / size.width;
  const height = size.height * scale;
  const here = pageNotes(notes, n);
  const [chosen, setChosen] = useState<string | null>(null);

  // The page drawn, and its text laid over it, once near the screen and at each zoom.
  useEffect(() => {
    if (!near || !canvas.current || !text.current) return;
    const r = doc.render(n, canvas.current, width);
    void doc.text(n, text.current, width).catch(() => undefined);
    return () => {
      r.cancel();
    };
  }, [near, doc, n, width]);

  // Ink written on the page, with the app's pen tools.
  const strokes = here.strokes;
  const latest = useRef({ strokes, scale, onInk });
  useEffect(() => {
    latest.current = { strokes, scale, onInk };
  });
  useEffect(() => {
    const el = ink.current;
    if (!near || !el) return;
    const a = ctx.ink.attach(el, {
      strokes: scaleStrokes(latest.current.strokes, latest.current.scale),
      onChange: (shown) => {
        latest.current.onInk(n, scaleStrokes(shown, 1 / latest.current.scale));
      },
    });
    attachment.current = a;
    return () => {
      a.dispose();
      attachment.current = null;
    };
  }, [near, ctx, n, width]);
  useEffect(() => {
    attachment.current?.setStrokes(scaleStrokes(strokes, scale));
  }, [strokes, scale]);

  return (
    <div
      ref={box}
      className={`pdf-page ${mode}`}
      data-page={n}
      style={{ width, height }}
      aria-label={`Page ${String(n)}`}
      role="group"
      // A click on highlighted text, choosing nothing, chooses the highlight.
      onClick={(e) => {
        if (mode !== 'select' || window.getSelection()?.isCollapsed === false) return;
        if ((e.target as Element).closest('button')) return;
        const r = e.currentTarget.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width;
        const y = (e.clientY - r.top) / r.height;
        const hit = here.highlights.find((h) =>
          h.rects.some((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h),
        );
        setChosen(hit ? hit.id : null);
      }}
    >
      <canvas ref={canvas} />
      <div className="pdf-highlights">
        {here.highlights.map((h) =>
          h.rects.map((r, i) => (
            <span
              key={`${h.id}-${String(i)}`}
              role="img"
              className={chosen === h.id ? 'pdf-highlight chosen' : 'pdf-highlight'}
              aria-label={`Highlight: ${h.text}`}
              style={{
                left: `${String(r.x * 100)}%`,
                top: `${String(r.y * 100)}%`,
                width: `${String(r.w * 100)}%`,
                height: `${String(r.h * 100)}%`,
                background: h.colour,
              }}
            />
          )),
        )}
      </div>
      <div ref={text} className="pdf-text" />
      <div ref={ink} className="pdf-ink" />
      {chosen !== null && (
        <button
          type="button"
          className="pdf-remove-highlight"
          onClick={() => {
            onRemoveHighlight(n, chosen);
            setChosen(null);
          }}
        >
          Remove highlight
        </button>
      )}
      <SelectionHighlighter n={n} box={box} active={mode === 'select'} onHighlight={onHighlight} />
    </div>
  );
}

/** A Highlight button beside text chosen on the page. */
function SelectionHighlighter({
  n,
  box,
  active,
  onHighlight,
}: {
  n: number;
  box: React.RefObject<HTMLDivElement | null>;
  active: boolean;
  onHighlight: (n: number, highlight: PdfHighlight) => void;
}) {
  const [offer, setOffer] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (!active) return;
    const onUp = () => {
      const sel = window.getSelection();
      const page = box.current;
      if (!sel || sel.isCollapsed || !page || !page.contains(sel.anchorNode)) {
        setOffer(null);
        return;
      }
      const rects = [...sel.getRangeAt(0).getClientRects()];
      const last = rects.at(-1);
      const pr = page.getBoundingClientRect();
      if (!last) return;
      setOffer({ x: last.right - pr.left, y: last.bottom - pr.top + 4 });
    };
    document.addEventListener('pointerup', onUp);
    return () => {
      document.removeEventListener('pointerup', onUp);
    };
  }, [active, box]);
  if (!active || offer === null) return null;

  const highlight = () => {
    const sel = window.getSelection();
    const page = box.current;
    if (!sel || sel.isCollapsed || !page) return;
    const rects = [...sel.getRangeAt(0).getClientRects()].map((r) => ({
      x: r.left,
      y: r.top,
      w: r.width,
      h: r.height,
    }));
    const boxes = highlightBoxes(rects, page.getBoundingClientRect());
    if (boxes.length > 0) {
      onHighlight(n, {
        id: newStrokeId(),
        colour: HIGHLIGHT,
        rects: boxes,
        text: sel.toString().replace(/\s+/g, ' ').trim(),
      });
    }
    sel.removeAllRanges();
    setOffer(null);
  };

  return (
    <button
      type="button"
      className="pdf-highlight-offer"
      style={{ left: offer.x, top: offer.y }}
      onPointerDown={(e) => {
        e.preventDefault();
      }}
      onClick={highlight}
    >
      Highlight
    </button>
  );
}

/**
 * A PDF to read, highlight and write on. Notes are kept beside it in
 * `<file>.pdf.annot.json`; the PDF is only ever read.
 */
export function PdfReader({ ctx, path }: { ctx: ModuleContext; path: string }) {
  const [doc, setDoc] = useState<PdfDocument | null>(null);
  const [sizes, setSizes] = useState<PageSize[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<PdfNotes>(emptyNotes());
  const [unreadable, setUnreadable] = useState(false);
  const [zoom, setZoom] = useState<number | 'fit'>('fit');
  const [fitWidth, setFitWidth] = useState(800);
  const [mode, setMode] = useState<Mode>(ctx.platform === 'tablet' ? 'write' : 'select');
  const [thumbs, setThumbs] = useState(ctx.platform === 'desktop');
  const pagesRef = useRef<HTMLDivElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const written = useRef<string | null>(null);
  const latestNotes = useRef(notes);
  useEffect(() => {
    latestNotes.current = notes;
  }, [notes]);

  // The PDF, and its notes.
  useEffect(() => {
    // Read through an object: the clean-up changes it while these wait.
    const run = { live: true };
    let opened: PdfDocument | null = null;
    void (async () => {
      try {
        opened = await ctx.files.openPdf(await ctx.vault.readBytes(path));
        const all = await Promise.all(
          Array.from({ length: opened.pages }, (_, i) => (opened as PdfDocument).size(i + 1)),
        );
        if (!run.live) return;
        setSizes(all);
        setDoc(opened);
      } catch (err) {
        if (run.live) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    void (async () => {
      const file = notesPath(path);
      if (!(await ctx.vault.exists(file))) return;
      const text = await ctx.vault.readText(file);
      const parsed = parseNotes(text);
      if (!run.live) return;
      if (parsed === null) setUnreadable(true);
      else {
        written.current = text;
        setNotes(parsed);
      }
    })();
    return () => {
      run.live = false;
      opened?.destroy();
    };
  }, [ctx, path]);

  // Notes changed on another device, through sync.
  useEffect(() => {
    const file = notesPath(path);
    const watching = ctx.vault.watch((change) => {
      if (!change.paths.includes(file)) return;
      void ctx.vault.readText(file).then((text) => {
        if (text === written.current) return;
        const parsed = parseNotes(text);
        if (parsed) {
          written.current = text;
          setNotes(parsed);
        }
      });
    });
    return () => {
      watching.dispose();
    };
  }, [ctx, path]);

  // Fit to the space there is.
  useEffect(() => {
    const el = pagesRef.current;
    if (!el || typeof ResizeObserver !== 'function') return;
    const ro = new ResizeObserver(() => {
      setFitWidth(Math.max(240, Math.min(1100, el.clientWidth - 32)));
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
    };
  }, [doc]);

  const save = useCallback(
    (next: PdfNotes) => {
      setNotes(next);
      if (unreadable) return;
      if (saveTimer.current !== null) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        saveTimer.current = null;
        const text = serialiseNotes(latestNotes.current);
        written.current = text;
        void ctx.vault.writeText(notesPath(path), text);
      }, SAVE_DELAY_MS);
    },
    [ctx, path, unreadable],
  );

  // Anything waiting is written when the reader closes.
  useEffect(
    () => () => {
      if (saveTimer.current !== null) {
        clearTimeout(saveTimer.current);
        void ctx.vault.writeText(notesPath(path), serialiseNotes(latestNotes.current));
      }
    },
    [ctx, path],
  );

  if (error !== null) return <p className="notice">This PDF could not be opened. {error}</p>;
  if (!doc) return <p className="hint">Opening…</p>;

  const width = (n: number) => {
    const size = sizes[n - 1] ?? { width: 612, height: 792 };
    return zoom === 'fit' ? fitWidth : size.width * zoom;
  };
  const zoomBy = (dir: 1 | -1) => {
    const now = zoom === 'fit' ? fitWidth / (sizes[0]?.width ?? 612) : zoom;
    const next =
      dir === 1
        ? ZOOMS.find((z) => z > now + 0.01)
        : [...ZOOMS].reverse().find((z) => z < now - 0.01);
    if (next !== undefined) setZoom(next);
  };
  const goTo = (n: number) => {
    pagesRef.current
      ?.querySelector(`[data-page="${String(n)}"]`)
      ?.scrollIntoView({ block: 'start' });
  };
  const percent = Math.round((zoom === 'fit' ? fitWidth / (sizes[0]?.width ?? 612) : zoom) * 100);

  return (
    <div className="pdf-reader">
      <div className="pdf-bar" role="toolbar" aria-label="Reading">
        <button
          type="button"
          className="quiet"
          aria-pressed={thumbs}
          onClick={() => {
            setThumbs(!thumbs);
          }}
        >
          Pages
        </button>
        <span className="pdf-zoom">
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() => {
              zoomBy(-1);
            }}
          >
            −
          </button>
          <span aria-live="polite">{percent}%</span>
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() => {
              zoomBy(1);
            }}
          >
            +
          </button>
          <button
            type="button"
            className="quiet"
            aria-pressed={zoom === 'fit'}
            onClick={() => {
              setZoom('fit');
            }}
          >
            Fit width
          </button>
        </span>
        <span className="layout-switch" role="radiogroup" aria-label="What the pen and mouse do">
          <button
            type="button"
            role="radio"
            aria-checked={mode === 'select'}
            onClick={() => {
              setMode('select');
            }}
          >
            Select text
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={mode === 'write'}
            onClick={() => {
              setMode('write');
            }}
          >
            Write on pages
          </button>
        </span>
        <span className="hint">{doc.pages} pages</span>
      </div>
      {unreadable && (
        <p className="notice">
          The notes beside this PDF could not be read, so they are left as they are. New notes are
          not saved.
        </p>
      )}
      <div className="pdf-body">
        {thumbs && (
          <nav className="pdf-thumbs" aria-label="Pages">
            {sizes.map((s, i) => (
              <Thumb key={i} doc={doc} n={i + 1} size={s} onGo={goTo} />
            ))}
          </nav>
        )}
        <div className="pdf-pages" ref={pagesRef}>
          {sizes.map((s, i) => (
            <Page
              key={i}
              ctx={ctx}
              doc={doc}
              n={i + 1}
              size={s}
              width={width(i + 1)}
              mode={mode}
              notes={notes}
              onInk={(n, strokes) => {
                save(withPage(latestNotes.current, n, { strokes }));
              }}
              onHighlight={(n, h) => {
                const page = pageNotes(latestNotes.current, n);
                save(withPage(latestNotes.current, n, { highlights: [...page.highlights, h] }));
              }}
              onRemoveHighlight={(n, id) => {
                const page = pageNotes(latestNotes.current, n);
                save(
                  withPage(latestNotes.current, n, {
                    highlights: page.highlights.filter((h) => h.id !== id),
                  }),
                );
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
