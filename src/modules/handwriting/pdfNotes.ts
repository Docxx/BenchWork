import type { InkPoint, InkStroke } from '@core/api';

/**
 * Notes on a PDF, kept beside it in `<file>.pdf.annot.json`: ink and
 * highlights for each page. The PDF itself is never changed.
 *
 * Strokes are stored in PDF points, as the page is at 100%, so they stay
 * on the same words at any zoom. Highlights are stored as fractions of the
 * page's width and height.
 */

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PdfHighlight {
  id: string;
  colour: string;
  /** Fractions of the page, 0 to 1. */
  rects: Box[];
  /** The words highlighted, for search and for reading the file. */
  text: string;
}

export interface PageNotes {
  strokes: InkStroke[];
  highlights: PdfHighlight[];
}

export interface PdfNotes {
  version: 1;
  /** By page number, from 1. */
  pages: Record<string, PageNotes>;
}

export const NOTES_ENDING = '.annot.json';

/** Where a PDF's notes are kept. */
export function notesPath(pdfPath: string): string {
  return `${pdfPath}${NOTES_ENDING}`;
}

export function emptyNotes(): PdfNotes {
  return { version: 1, pages: {} };
}

export function pageNotes(notes: PdfNotes, page: number): PageNotes {
  return notes.pages[String(page)] ?? { strokes: [], highlights: [] };
}

/** The notes with one page's changed; pages left with nothing are dropped. */
export function withPage(notes: PdfNotes, page: number, changes: Partial<PageNotes>): PdfNotes {
  const next = { ...pageNotes(notes, page), ...changes };
  const key = String(page);
  const others = Object.entries(notes.pages).filter(([k]) => k !== key);
  const empty = next.strokes.length === 0 && next.highlights.length === 0;
  return { version: 1, pages: Object.fromEntries(empty ? others : [...others, [key, next]]) };
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function readBox(v: unknown): Box | null {
  if (typeof v !== 'object' || v === null) return null;
  const b = v as Record<string, unknown>;
  return finite(b['x']) && finite(b['y']) && finite(b['w']) && finite(b['h'])
    ? { x: b['x'], y: b['y'], w: b['w'], h: b['h'] }
    : null;
}

function readStroke(v: unknown): InkStroke | null {
  if (typeof v !== 'object' || v === null) return null;
  const s = v as Record<string, unknown>;
  const points = Array.isArray(s['points'])
    ? s['points'].filter(
        (p): p is InkPoint => Array.isArray(p) && p.length === 4 && p.every(finite),
      )
    : [];
  if (typeof s['id'] !== 'string' || points.length === 0) return null;
  return {
    id: s['id'],
    tool: s['tool'] === 'highlighter' ? 'highlighter' : 'pen',
    colour: typeof s['colour'] === 'string' ? s['colour'] : '#1d2725',
    width: finite(s['width']) ? s['width'] : 2,
    points,
  };
}

/** Reads a notes file; never throws. Null if it is not one, so it is never written over. */
export function parseNotes(text: string): PdfNotes | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;
  const raw = (data as Record<string, unknown>)['pages'];
  const notes = emptyNotes();
  if (typeof raw !== 'object' || raw === null) return notes;
  for (const [page, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^\d+$/.test(page) || typeof value !== 'object' || value === null) continue;
    const v = value as Record<string, unknown>;
    const strokes = Array.isArray(v['strokes'])
      ? v['strokes'].map(readStroke).filter((s): s is InkStroke => s !== null)
      : [];
    const highlights = Array.isArray(v['highlights'])
      ? v['highlights'].flatMap((h): PdfHighlight[] => {
          if (typeof h !== 'object' || h === null) return [];
          const r = h as Record<string, unknown>;
          const rects = Array.isArray(r['rects'])
            ? r['rects'].map(readBox).filter((b): b is Box => b !== null)
            : [];
          if (typeof r['id'] !== 'string' || rects.length === 0) return [];
          return [
            {
              id: r['id'],
              colour: typeof r['colour'] === 'string' ? r['colour'] : '#ffd84d',
              rects,
              text: typeof r['text'] === 'string' ? r['text'] : '',
            },
          ];
        })
      : [];
    notes.pages[page] = { strokes, highlights };
  }
  return notes;
}

const round = (n: number, places: number) => {
  const f = 10 ** places;
  return Math.round(n * f) / f;
};

/** Writes a notes file: a page per block, a stroke or highlight per line. */
export function serialiseNotes(notes: PdfNotes): string {
  const pages = Object.keys(notes.pages)
    .sort((a, b) => Number(a) - Number(b))
    .map((page) => {
      const p = notes.pages[page] ?? { strokes: [], highlights: [] };
      const strokes = p.strokes.map((s) =>
        JSON.stringify({
          ...s,
          points: s.points.map(([x, y, pr, t]) => [round(x, 2), round(y, 2), round(pr, 3), t]),
        }),
      );
      const highlights = p.highlights.map((h) =>
        JSON.stringify({
          ...h,
          rects: h.rects.map((r) => ({
            x: round(r.x, 5),
            y: round(r.y, 5),
            w: round(r.w, 5),
            h: round(r.h, 5),
          })),
        }),
      );
      const list = (items: string[]) =>
        items.length === 0 ? '[]' : `[\n        ${items.join(',\n        ')}\n      ]`;
      return `    ${JSON.stringify(page)}: {\n      "strokes": ${list(strokes)},\n      "highlights": ${list(highlights)}\n    }`;
    });
  return pages.length === 0
    ? '{\n  "version": 1,\n  "pages": {}\n}\n'
    : `{\n  "version": 1,\n  "pages": {\n${pages.join(',\n')}\n  }\n}\n`;
}

/** Strokes scaled by `factor`: from points to the page as shown, or back. */
export function scaleStrokes(strokes: readonly InkStroke[], factor: number): InkStroke[] {
  return strokes.map((s) => ({
    ...s,
    points: s.points.map(([x, y, p, t]): InkPoint => [x * factor, y * factor, p, t]),
  }));
}

/** A highlight's boxes from the selection's screen rectangles, as fractions of the page. */
export function highlightBoxes(rects: readonly Box[], page: DOMRect | Box): Box[] {
  const left = 'left' in page ? page.left : page.x;
  const top = 'top' in page ? page.top : page.y;
  const width = 'width' in page ? page.width : page.w;
  const height = 'height' in page ? page.height : page.h;
  return rects
    .filter((r) => r.w > 1 && r.h > 1)
    .map((r) => ({
      x: (r.x - left) / width,
      y: (r.y - top) / height,
      w: r.w / width,
      h: r.h / height,
    }))
    .filter((b) => b.x < 1 && b.y < 1 && b.x + b.w > 0 && b.y + b.h > 0);
}
