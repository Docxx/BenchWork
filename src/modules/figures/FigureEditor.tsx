import {
  ChartColumn,
  Download,
  FileText,
  Grid2x2,
  ImagePlus,
  MoveRight,
  Redo2,
  Table2,
  Type,
  Undo2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ModuleContext, PdfDocument } from '@core/api';
import { FigureSave } from './figureSave';
import { BlockControls, PageControls, TextControls } from './BlockControls';
import { blotTop, newTable, tableHeight } from './blot';
import { newChart } from './chart';
import { ChartControls } from './ChartControls';
import {
  blockAt,
  blockGrid,
  bottomOf,
  contentBox,
  duplicate,
  editBlock,
  fitText,
  heightFor,
  layoutDoc,
  letters,
  letterStrip,
  newText,
  parseDoc,
  removeBlock,
  restack,
  serialiseDoc,
  type Block,
  type DocLayout,
  type FigureDoc,
  type GridBlock,
} from './doc';
import {
  GRAPHIC_TYPES,
  NO_TRIM,
  pdfPicture,
  shownRect,
  svgPicture,
  type GraphicSource,
} from './graphic';
import { GridControls, PanelControls } from './GridControls';
import { BlotControls, GraphicControls, ShapeControls, TableControls } from './PartControls';
import { newShape } from './shapes';
import {
  DEFAULT_CROP,
  FIGURE_ENDING,
  fillWith,
  layout,
  newId,
  panelAt,
  POINT,
  panned,
  sourceRect,
  type Box,
  type Crop,
  type Grid,
  type Mark,
  type MarkKind,
  type Panel,
} from './model';
import { boxToImage, imageToBox } from './marks';
import { loadPlanes, picture, showsFor } from './images';
import { toPdf, toPng, toSvg, toTiff, type ExportFormat } from './exportFigure';
import { methodsNote } from './methods';
import { drawFigure, type Source } from './render';
import { buildScene, handlesOf, wrapText } from './scene';
import { keepShape, resized, snapMove, snapResize, type Edges, type Guide } from './snap';
import type { Planes } from './tiff';
import './figures.css';

const ICON = { size: 17, strokeWidth: 1.8, 'aria-hidden': true } as const;
const SAVE_MS = 500;
const MAX_UNDO = 60;
const IMAGE_TYPES = /\.(png|jpe?g|gif|webp|bmp|tiff?)$/i;
/** Room kept below the lowest part on screen, mm, to drop and add more. */
const ROOM_BELOW = 50;
/** Handle size and reach on screen, px. */
const HANDLE_PX = 9;
const REACH_PX = 7;

const dirOf = (path: string) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');

interface Selection {
  block: string | null;
  /** Panels chosen inside a grid block. */
  panels: string[];
}

const NONE: Selection = { block: null, panels: [] };

interface AddTarget {
  panel?: string;
  at?: { x: number; y: number };
}

/** A grid block with its new grid, grown to keep its rows' height when asked. */
function withGrid(doc: FigureDoc, id: string, grid: Grid, grow: boolean): FigureDoc {
  return editBlock(doc, id, (b) =>
    b.kind === 'grid' ? { ...b, grid, h: grow ? heightFor(doc, b, grid) : b.h } : b,
  );
}

/** Where a panel is on the page, with its block. */
function findPanel(l: DocLayout, panelId: string) {
  for (const b of l.blocks) {
    const box = b.grid?.panels.find((p) => p.panel.id === panelId);
    if (box && b.block.kind === 'grid') return { block: b.block, box };
  }
  return null;
}

/** The handle of a chosen part under a point: resizing by its edges, or moving. */
function handleAt(box: Box, p: { x: number; y: number }, perMm: number) {
  const handles = handlesOf(box, HANDLE_PX / perMm);
  const reach = REACH_PX / perMm;
  const m = handles.move;
  if (Math.hypot(p.x - m.x, p.y - m.y) < m.r + reach) return { move: true as const };
  const hd = handles.resize.find(
    (h) =>
      Math.abs(p.x - (h.box.x + h.box.w / 2)) < reach &&
      Math.abs(p.y - (h.box.y + h.box.h / 2)) < reach,
  );
  return hd ? { edges: hd.edges } : null;
}

function cursorFor(edges: Edges): string {
  const diag = (edges.left && edges.top) || (edges.right && edges.bottom);
  const anti = (edges.right && edges.top) || (edges.left && edges.bottom);
  if (diag) return 'nwse-resize';
  if (anti) return 'nesw-resize';
  return edges.left || edges.right ? 'ew-resize' : 'ns-resize';
}

/**
 * A figure: parts placed freely on a page of real size. Drop images on the
 * page to add them, or onto a grid's panels to fill it; drag parts into
 * place, where they snap to each other. Once a part is chosen, dragging
 * inside an image moves the image in its frame.
 */
export function FigureEditor({ ctx, path }: { ctx: ModuleContext; path: string }) {
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [doc, setDoc] = useState<FigureDoc | null>(null);
  const [status, setStatus] = useState<'reading' | 'ready' | 'unreadable'>('reading');
  const [sel, setSel] = useState<Selection>(NONE);
  const selRef = useRef(sel);
  useEffect(() => {
    selRef.current = sel;
  }, [sel]);
  /** What pressing a panel does: move its image, place a mark, or draw an inset's region. */
  const [tool, setTool] = useState<'move' | MarkKind | 'inset'>('move');
  const toolRef = useRef(tool);
  useEffect(() => {
    toolRef.current = tool;
  }, [tool]);
  const [selectedMark, setSelectedMark] = useState<string | null>(null);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [history, setHistory] = useState({ undo: 0, redo: 0 });
  const [loaded, setLoaded] = useState(0);
  const [readImages, setReadImages] = useState<ReadonlyMap<string, Planes>>(new Map());
  const [scale, setScale] = useState(3);
  /** Where images from the file chooser go. */
  const addTarget = useRef<AddTarget>({});

  const current = useRef<FigureDoc | null>(null);
  const undo = useRef<FigureDoc[]>([]);
  const redo = useRef<FigureDoc[]>([]);
  const persistence = useMemo(
    () => new FigureSave((text) => ctx.vault.writeText(path, text)),
    [ctx, path],
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const planes = useRef(new Map<string, Planes>());
  const loading = useRef(new Set<string>());
  const pictures = useRef(new Map<string, HTMLCanvasElement>());
  /** Graphs read so far, by file and page; and PDFs kept open to draw again for export. */
  const graphs = useRef(new Map<string, GraphicSource>());
  const graphsLoading = useRef(new Set<string>());
  const pdfs = useRef(new Map<string, PdfDocument>());
  const [graphPages, setGraphPages] = useState<ReadonlyMap<string, number>>(new Map());

  // ---- Saving ----
  const flush = useCallback(async () => {
    if (saveTimer.current !== null) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    try {
      await persistence.flush();
      setSaveError(null);
    } catch (err) {
      setSaveError(
        `This figure could not be saved. ${err instanceof Error ? err.message : String(err)}`,
      );
      throw err;
    }
  }, [persistence]);

  const save = useCallback(
    (next: FigureDoc) => {
      persistence.edit(serialiseDoc(next));
      if (saveTimer.current !== null) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        saveTimer.current = null;
        void flush().catch(() => undefined);
      }, SAVE_MS);
    },
    [persistence, flush],
  );

  useEffect(() => {
    const guard = ctx.app.beforeLeave(flush);
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (persistence.dirty) event.preventDefault();
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      guard.dispose();
      window.removeEventListener('beforeunload', beforeUnload);
      if (saveTimer.current !== null) clearTimeout(saveTimer.current);
    };
  }, [ctx, flush, persistence]);

  /** Puts a change in place: kept for undo, shown and saved. */
  const commit = useCallback(
    (next: FigureDoc, remember = true) => {
      const before = current.current;
      if (remember && before) {
        undo.current.push(before);
        if (undo.current.length > MAX_UNDO) undo.current.shift();
        redo.current = [];
      }
      current.current = next;
      setDoc(next);
      setHistory({ undo: undo.current.length, redo: redo.current.length });
      save(next);
    },
    [save],
  );

  const stepHistory = (back: boolean) => {
    const from = back ? undo.current : redo.current;
    const to = back ? redo.current : undo.current;
    const next = from.pop();
    if (!next || !current.current) return;
    to.push(current.current);
    current.current = next;
    setDoc(next);
    setHistory({ undo: undo.current.length, redo: redo.current.length });
    save(next);
  };

  // ---- Images ----
  const loadImage = useCallback(
    (file: string) => {
      if (planes.current.has(file) || loading.current.has(file)) return;
      loading.current.add(file);
      void ctx.vault
        .readBytes(file)
        .then((bytes) => loadPlanes(bytes, file))
        .then((read) => {
          planes.current.set(file, read);
          setLoaded((n) => n + 1);
          setReadImages(new Map(planes.current));
          // A pixel size the file gives fills in panels that have none yet.
          const d = current.current;
          if (read.umPerPx === null || !d) return;
          const missing = (b: Block) =>
            b.kind === 'grid' &&
            b.grid.panels.some((p) => p.image?.path === file && p.image.umPerPx === null);
          if (!d.blocks.some(missing)) return;
          const blocks = d.blocks.map((b): Block =>
            b.kind !== 'grid' || !missing(b)
              ? b
              : {
                  ...b,
                  grid: {
                    ...b.grid,
                    panels: b.grid.panels.map((p) =>
                      p.image?.path === file && p.image.umPerPx === null
                        ? { ...p, image: { ...p.image, umPerPx: read.umPerPx } }
                        : p,
                    ),
                  },
                },
          );
          const next = { ...d, blocks };
          current.current = next;
          setDoc(next);
          save(next);
        })
        .catch((err: unknown) => {
          setNotice(
            `${file.split('/').at(-1) ?? file} could not be read. ${err instanceof Error ? err.message : String(err)}`,
          );
        });
    },
    [ctx, save],
  );

  /** Reads a graph's file, once for each file and page. */
  const loadGraph = useCallback(
    (file: string, page: number) => {
      const key = `${file}#${String(page)}`;
      if (graphs.current.has(key) || graphsLoading.current.has(key)) return;
      graphsLoading.current.add(key);
      void (async () => {
        const bytes = await ctx.vault.readBytes(file);
        let source: GraphicSource | null;
        if (/\.pdf$/i.test(file)) {
          let pdf = pdfs.current.get(file);
          if (!pdf) {
            pdf = await ctx.files.openPdf(bytes);
            pdfs.current.set(file, pdf);
            const pages = pdf.pages;
            setGraphPages((m) => new Map(m).set(file, pages));
          }
          source = await pdfPicture(pdf, Math.min(page, pdf.pages), 2400);
        } else source = await svgPicture(new TextDecoder().decode(bytes));
        if (!source) throw new Error('It is not an SVG drawing.');
        graphs.current.set(key, source);
        setLoaded((n) => n + 1);
      })().catch((err: unknown) => {
        setNotice(
          `${file.split('/').at(-1) ?? file} could not be read. ${err instanceof Error ? err.message : String(err)}`,
        );
      });
    },
    [ctx],
  );

  useEffect(
    () => () => {
      for (const pdf of pdfs.current.values()) pdf.destroy();
    },
    [],
  );

  useEffect(() => {
    for (const b of doc?.blocks ?? []) {
      if (b.kind === 'graphic') loadGraph(b.graphic.path, b.graphic.page);
      if (b.kind !== 'grid') continue;
      for (const p of b.grid.panels) if (p.image) loadImage(p.image.path);
    }
  }, [doc, loadImage, loadGraph]);

  /** Each graph part's picture, by block id. */
  const graphsFor = useCallback((d: FigureDoc) => {
    const out = new Map<string, GraphicSource>();
    for (const b of d.blocks) {
      if (b.kind !== 'graphic') continue;
      const source = graphs.current.get(`${b.graphic.path}#${String(b.graphic.page)}`);
      if (source) out.set(b.id, source);
    }
    return out;
  }, []);

  // ---- Reading, and following changes made elsewhere ----
  useEffect(() => {
    let live = true;
    const read = async () => {
      const text = await ctx.vault.readText(path);
      if (!live || persistence.dirty) return;
      const parsed = parseDoc(text);
      if (parsed === null) {
        setStatus('unreadable');
        return;
      }
      if (!persistence.accept(text)) return;
      current.current = parsed;
      setDoc(parsed);
      setStatus('ready');
    };
    void read().catch(() => {
      if (live) setStatus('unreadable');
    });
    const watch = ctx.vault.watch((change) => {
      if (change.paths.includes(path) && !persistence.dirty) void read().catch(() => undefined);
    });
    return () => {
      live = false;
      watch.dispose();
    };
  }, [ctx, path, persistence]);

  /** Each panel's picture, shown as its grid says; made once and kept. */
  const sourcesFor = useCallback((d: FigureDoc) => {
    const sources = new Map<string, Source>();
    for (const b of d.blocks) {
      if (b.kind !== 'grid') continue;
      for (const panel of b.grid.panels) {
        const read = panel.image ? planes.current.get(panel.image.path) : undefined;
        if (!panel.image || !read) continue;
        const shows = showsFor(b.grid, panel, read, planes.current);
        const key = `${panel.image.path}|${JSON.stringify(shows)}`;
        let made = pictures.current.get(key);
        if (!made) {
          made = picture(read, shows);
          pictures.current.set(key, made);
          if (pictures.current.size > 80) {
            const oldest = pictures.current.keys().next().value;
            if (oldest !== undefined) pictures.current.delete(oldest);
          }
        }
        sources.set(panel.id, { image: made, w: read.width, h: read.height });
      }
    }
    return sources;
  }, []);

  // ---- Exporting ----
  const [format, setFormat] = useState<ExportFormat>('png');
  const [dpi, setDpi] = useState(300);
  const [busy, setBusy] = useState(false);
  const [exported, setExported] = useState<string | null>(null);
  const [methods, setMethods] = useState<string | null>(null);
  const baseName = (path.split('/').at(-1) ?? 'Figure').slice(0, -FIGURE_ENDING.length);
  const folder = dirOf(path);

  const exportFigure = async () => {
    const d = current.current;
    if (!d) return;
    if (d.blocks.length === 0) {
      setNotice('The page is empty. Add images, a grid or text first.');
      return;
    }
    const waiting = d.blocks.some(
      (b) =>
        b.kind === 'grid' &&
        b.grid.panels.some((p) => p.image && !planes.current.has(p.image.path)),
    );
    if (waiting) {
      setNotice('Some images are still being read. Try again in a moment.');
      return;
    }
    setBusy(true);
    setExported(null);
    try {
      // The page starts at the top part: no empty band above it.
      const top = Math.min(...d.blocks.map((b) => b.y));
      const trimmed = { ...d, blocks: d.blocks.map((b) => ({ ...b, y: b.y - top })) };
      // PDF graphs are drawn again, finely enough for the export.
      const graphics = graphsFor(d);
      for (const b of d.blocks) {
        const pdf = b.kind === 'graphic' ? pdfs.current.get(b.graphic.path) : undefined;
        if (b.kind !== 'graphic' || !pdf) continue;
        const t = b.graphic.trim;
        const px = (b.w / Math.max(0.1, 1 - t.left - t.right)) * (Math.max(dpi, 600) / 25.4);
        graphics.set(b.id, await pdfPicture(pdf, Math.min(b.graphic.page, pdf.pages), px));
      }
      const scene = buildScene(trimmed, { sources: sourcesFor(d), graphics, editing: false });
      const ext = { png: '.png', tiff: '.tif', svg: '.svg', pdf: '.pdf' }[format];
      const name = await ctx.vault.freeName(folder, baseName, ext);
      const target = folder === '' ? name : `${folder}/${name}`;
      if (format === 'svg') await ctx.vault.writeText(target, await toSvg(scene, dpi));
      else {
        const bytes =
          format === 'png'
            ? await toPng(scene, dpi)
            : format === 'tiff'
              ? toTiff(scene, dpi)
              : await toPdf(scene, dpi);
        await ctx.vault.writeBytes(target, bytes);
      }
      setExported(target);
    } catch (err) {
      setNotice(
        `The figure could not be exported. ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setBusy(false);
    }
  };

  // ---- Fitting the page to the room ----
  const pageWidth = doc?.width ?? 174;
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const measure = () => {
      const box = el.getBoundingClientRect();
      setScale(Math.max(0.5, Math.min((box.width - 48) / pageWidth, 12)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, [pageWidth, status]);

  // ---- Drawing ----
  useEffect(() => {
    const c = canvas.current;
    const g = c?.getContext('2d');
    if (!c || !g || !doc) return;
    const height = layoutDoc(doc).height + ROOM_BELOW;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(doc.width * scale * ratio);
    c.height = Math.round(height * scale * ratio);
    c.style.width = `${String(doc.width * scale)}px`;
    c.style.height = `${String(height * scale)}px`;
    g.setTransform(ratio, 0, 0, ratio, 0, 0);
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, doc.width * scale, height * scale);
    drawFigure(g, doc, {
      scale,
      sources: sourcesFor(doc),
      graphics: graphsFor(doc),
      editing: true,
      selectedBlock: sel.block,
      selectedPanels: sel.panels,
      selectedMark,
      guides,
      handle: HANDLE_PX / scale,
      accent: getComputedStyle(c).getPropertyValue('--accent').trim() || '#2f5fb3',
    });
  }, [doc, scale, sel, selectedMark, guides, loaded, sourcesFor, graphsFor]);

  // ---- Adding ----
  /** Puts a new part on the page, at a point or below the rest, and chooses it. */
  const place = useCallback(
    (
      make: (d: FigureDoc, at: { x: number; y: number }) => Block,
      at?: { x: number; y: number },
    ) => {
      const d = current.current;
      if (!d) return;
      const b = make(d, at ?? { x: 0, y: bottomOf(d) });
      const x = Math.max(0, Math.min(d.width - b.w, b.x));
      commit({ ...d, blocks: [...d.blocks, { ...b, x }] });
      setSel({ block: b.id, panels: [] });
    },
    [commit],
  );

  const addFiles = useCallback(
    async (files: readonly File[], target: AddTarget) => {
      const d = current.current;
      if (!d) return;
      const attachments = `${dirOf(path)}${dirOf(path) === '' ? '' : '/'}attachments`;
      const added: string[] = [];
      const graphFiles: string[] = [];
      try {
        for (const file of files) {
          const graph = GRAPHIC_TYPES.test(file.name);
          if (!graph && !IMAGE_TYPES.test(file.name) && !file.type.startsWith('image/')) {
            setNotice(`${file.name} is not an image BenchWork can show yet.`);
            continue;
          }
          await ctx.vault.ensureDir(attachments);
          const stem =
            file.name.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|#^[\]]+/g, '-') || 'image';
          const ext = /\.[a-z0-9]+$/i.exec(file.name)?.[0].toLowerCase() ?? '.png';
          const name = await ctx.vault.freeName(attachments, stem, ext);
          const saved = `${attachments}/${name}`;
          const bytes = new Uint8Array(await file.arrayBuffer());
          await ctx.vault.writeBytes(saved, bytes);
          if (graph) {
            graphFiles.push(saved);
            continue;
          }
          added.push(saved);
          // Read now, so a new part can take the image's shape.
          try {
            planes.current.set(saved, await loadPlanes(bytes, saved));
            loading.current.add(saved);
            setLoaded((n) => n + 1);
            setReadImages(new Map(planes.current));
          } catch {
            // Read again, and reported, when drawn.
          }
        }
      } catch (err) {
        setNotice(`That could not be added. ${err instanceof Error ? err.message : String(err)}`);
      }
      // Graphs: each a part of its own, half the page wide, shaped like the graph.
      for (const [i, file] of graphFiles.entries()) {
        let aspect = 0.75;
        try {
          const bytes = await ctx.vault.readBytes(file);
          if (/\.pdf$/i.test(file)) {
            const pdf = await ctx.files.openPdf(bytes);
            pdfs.current.set(file, pdf);
            const pages = pdf.pages;
            setGraphPages((m) => new Map(m).set(file, pages));
            const size = await pdf.size(1);
            aspect = size.height / size.width;
          } else {
            const source = await svgPicture(new TextDecoder().decode(bytes));
            if (source) {
              graphs.current.set(`${file}#1`, source);
              aspect = source.h / source.w;
            }
          }
        } catch {
          // Reported when it is drawn.
        }
        const at = target.at ? { x: target.at.x + i * 4, y: target.at.y + i * 4 } : undefined;
        place((doc, where) => {
          const w = Math.round(doc.width / 2);
          const strip = doc.letters.show ? letterStrip(doc) : 0;
          return {
            id: newId(),
            kind: 'graphic',
            x: where.x,
            y: where.y,
            w,
            h: w * aspect + strip,
            letter: null,
            graphic: { path: file, page: 1, trim: { ...NO_TRIM } },
          };
        }, at);
      }
      if (added.length === 0) return;
      const now = current.current ?? d;
      // Panels given these images take the pixel size each file brings.
      const sized = (g: Grid): Grid => ({
        ...g,
        panels: g.panels.map((p) => {
          const read = p.image ? planes.current.get(p.image.path) : undefined;
          return p.image && p.image.umPerPx === null && read?.umPerPx
            ? { ...p, image: { ...p.image, umPerPx: read.umPerPx } }
            : p;
        }),
      });
      // Onto a grid's panel: fill that grid from there.
      const into = target.panel ? findPanel(layoutDoc(now), target.panel) : null;
      if (into) {
        const grid = sized(fillWith(into.block.grid, added, target.panel));
        commit(withGrid(now, into.block.id, grid, true));
        return;
      }
      // Anywhere else: a new part, one image or a grid of them, shaped like the first.
      const first = planes.current.get(added[0] ?? '');
      const aspect = first ? first.height / first.width : 0.75;
      const cols = Math.min(added.length, 4);
      const rows = Math.ceil(added.length / cols);
      const width = added.length === 1 ? Math.round(now.width / 2) : now.width;
      place((doc, at) => {
        const base = blockGrid(rows, cols, width);
        const panelWidth = (width - base.gap * (cols - 1)) / cols;
        const grid = sized(
          fillWith({ ...base, rows: base.rows.map(() => panelWidth * aspect) }, added),
        );
        const strip = doc.letters.show ? letterStrip(doc) : 0;
        return {
          id: newId(),
          kind: 'grid',
          x: at.x,
          y: at.y,
          w: width,
          h: layout(grid).height + strip,
          letter: null,
          grid,
          blot: null,
        };
      }, target.at);
    },
    [ctx, path, commit, place],
  );

  const addGrid = () => {
    place((d, at) => {
      const grid = blockGrid(2, 3, d.width);
      const strip = d.letters.show ? letterStrip(d) : 0;
      return {
        id: newId(),
        kind: 'grid',
        x: at.x,
        y: at.y,
        w: d.width,
        h: layout(grid).height + strip,
        letter: null,
        grid,
        blot: null,
      };
    });
  };

  const addText = () => {
    place((_d, at) => ({
      id: newId(),
      kind: 'text',
      x: at.x,
      y: at.y,
      w: 50,
      h: 8,
      letter: null,
      text: newText(),
    }));
    setTimeout(() => document.getElementById('fig-text-input')?.focus(), 50);
  };

  const addChart = () => {
    place((d, at) => {
      const strip = d.letters.show ? letterStrip(d) : 0;
      return {
        id: newId(),
        kind: 'chart',
        x: at.x,
        y: at.y,
        w: 60,
        h: 50 + strip,
        letter: null,
        chart: newChart(),
      };
    });
  };

  const addTable = () => {
    place((_d, at) => {
      const table = newTable();
      return {
        id: newId(),
        kind: 'table',
        x: at.x,
        y: at.y,
        w: 60,
        h: tableHeight(table),
        letter: null,
        table,
      };
    });
  };

  const addLine = () => {
    place((_d, at) => ({
      id: newId(),
      kind: 'shape',
      x: at.x,
      y: at.y,
      w: 40,
      h: 6,
      letter: null,
      shape: newShape('line'),
    }));
  };

  // ---- Pointer: choosing, moving and resizing parts; moving and zooming images ----
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const pointers = new Map<number, { x: number; y: number }>();
    interface Moving {
      before: FigureDoc;
      moved: boolean;
    }
    type Drag =
      | (Moving & { mode: 'block'; id: string; start: Box; x: number; y: number })
      | (Moving & { mode: 'resize'; id: string; edges: Edges; start: Box; x: number; y: number })
      | (Moving & { mode: 'crop'; id: string; x: number; y: number })
      | (Moving & { mode: 'mark'; id: string; mark: string })
      | (Moving & { mode: 'inset'; id: string; u: number; v: number })
      | (Moving & { mode: 'side'; id: string; side: 'markers' | 'bands'; label: string })
      | { mode: 'scroll'; y: number; top: number };
    let drag: Drag | null = null;
    let pinch = 0;
    const show = (next: FigureDoc) => {
      current.current = next;
      setDoc(next);
    };
    const perMm = () => c.getBoundingClientRect().width / (current.current?.width ?? 1);
    const mm = (e: { clientX: number; clientY: number }) => {
      const r = c.getBoundingClientRect();
      const s = perMm();
      return { x: (e.clientX - r.left) / s, y: (e.clientY - r.top) / s };
    };

    const editPanel = (base: FigureDoc, id: string, change: (p: Panel) => Panel): FigureDoc => {
      const found = findPanel(layoutDoc(base), id);
      if (!found) return base;
      const grid = found.block.grid;
      return withGrid(
        base,
        found.block.id,
        { ...grid, panels: grid.panels.map((p) => (p.id === id ? change(p) : p)) },
        false,
      );
    };
    const setCrop = (
      id: string,
      change: (crop: Crop, box: Box, natural: { w: number; h: number }) => Crop,
      base: FigureDoc,
    ) => {
      const found = findPanel(layoutDoc(base), id);
      const panel = found?.box.panel;
      const read = panel?.image ? planes.current.get(panel.image.path) : undefined;
      if (!found || !panel?.image || !read) return null;
      const crop = change(panel.image.crop, found.box, { w: read.width, h: read.height });
      return editPanel(base, id, (p) => (p.image ? { ...p, image: { ...p.image, crop } } : p));
    };
    const zoomBy = (factor: number) => (crop: Crop) => ({
      ...crop,
      zoom: Math.min(40, Math.max(1, crop.zoom * factor)),
    });
    /** Where a pointer is in a panel's image, with that panel's box and the image's size. */
    const inImage = (e: { clientX: number; clientY: number }, id: string, base: FigureDoc) => {
      const box = findPanel(layoutDoc(base), id)?.box;
      const read = box?.panel.image ? planes.current.get(box.panel.image.path) : undefined;
      if (!box?.panel.image || !read) return null;
      const natural = { w: read.width, h: read.height };
      const at = mm(e);
      return { ...boxToImage(at.x, at.y, natural, box, box.panel.image.crop), box, natural };
    };
    const others = (d: FigureDoc, id: string) =>
      d.blocks.filter((b) => b.id !== id).map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h }));

    function down(e: PointerEvent) {
      c?.focus();
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      c?.setPointerCapture(e.pointerId);
      const d = current.current;
      if (!d) return;
      const p = mm(e);
      const l = layoutDoc(d);
      const s = selRef.current;
      pinch = 0;

      // A chosen part's handles: resize by the squares, move by the round one.
      const chosen = l.blocks.find((b) => b.block.id === s.block);
      const handle = chosen ? handleAt(chosen.box, p, perMm()) : null;
      if (chosen && handle) {
        const start = chosen.box;
        drag =
          'edges' in handle
            ? {
                mode: 'resize',
                id: chosen.block.id,
                edges: handle.edges,
                start,
                ...p,
                before: d,
                moved: false,
              }
            : { mode: 'block', id: chosen.block.id, start, ...p, before: d, moved: false };
        return;
      }

      const hit = blockAt(l, p.x, p.y);
      if (!hit) {
        setSel(NONE);
        setSelectedMark(null);
        drag = { mode: 'scroll', y: e.clientY, top: stage.current?.scrollTop ?? 0 };
        return;
      }
      const id = hit.block.id;
      const moveBlock: Drag = { mode: 'block', id, start: hit.box, ...p, before: d, moved: false };
      const panel = hit.grid ? panelAt(hit.grid, p.x, p.y) : null;

      // A part not chosen yet: choose it, and a drag moves it.
      if (s.block !== id) {
        setSel({ block: id, panels: panel ? [panel.panel.id] : [] });
        setSelectedMark(null);
        drag = moveBlock;
        return;
      }
      // A blot's size marker or band name, beside the image, moves up and down.
      if (hit.blot && hit.block.kind === 'grid' && hit.block.blot) {
        const img = hit.blot.image;
        const side = p.x < img.x ? 'markers' : p.x > img.x + img.w ? 'bands' : null;
        const near = side
          ? hit.block.blot[side].find((m) => Math.abs(img.y + m.at * img.h - p.y) < 2)
          : undefined;
        if (side && near) {
          drag = { mode: 'side', id, side, label: near.id, before: d, moved: false };
          return;
        }
      }
      if (!panel) {
        if (hit.grid) setSel({ block: id, panels: [] });
        drag = moveBlock;
        return;
      }
      const pid = panel.panel.id;
      if (e.shiftKey || e.ctrlKey || e.metaKey) {
        setSel({
          block: id,
          panels: s.panels.includes(pid) ? s.panels.filter((x) => x !== pid) : [...s.panels, pid],
        });
        return;
      }
      setSel({ block: id, panels: [pid] });
      const point = inImage(e, pid, d);
      if (!point) {
        drag = moveBlock;
        return;
      }
      const t = toolRef.current;
      if (t !== 'move' && t !== 'inset') {
        // A new mark where the image was pressed; the tool goes back to moving.
        const mark: Mark = {
          id: newId(),
          kind: t,
          u: point.u,
          v: point.v,
          angle: 135,
          size: t === 'text' ? 8 : 10,
          colour: '#ffffff',
          text: t === 'text' ? 'Text' : '',
        };
        commit(editPanel(d, pid, (x) => ({ ...x, marks: [...x.marks, mark] })));
        setSelectedMark(mark.id);
        setTool('move');
        return;
      }
      if (t === 'inset') {
        drag = { mode: 'inset', id: pid, u: point.u, v: point.v, before: d, moved: false };
        return;
      }
      // A mark under the pointer is picked up and moved.
      const crop = panel.panel.image?.crop ?? DEFAULT_CROP;
      const near = panel.panel.marks.find((m) => {
        const at = imageToBox(m.u, m.v, point.natural, point.box, crop);
        return at !== null && Math.hypot(at.x - p.x, at.y - p.y) < 3;
      });
      if (near) {
        setSelectedMark(near.id);
        drag = { mode: 'mark', id: pid, mark: near.id, before: d, moved: false };
        return;
      }
      setSelectedMark(null);
      drag = { mode: 'crop', id: pid, x: e.clientX, y: e.clientY, before: d, moved: false };
    }

    function hover(e: PointerEvent, d: FigureDoc) {
      const chosen = layoutDoc(d).blocks.find((b) => b.block.id === selRef.current.block);
      const handle = chosen ? handleAt(chosen.box, mm(e), perMm()) : null;
      if (c) c.style.cursor = !handle ? '' : 'edges' in handle ? cursorFor(handle.edges) : 'move';
    }

    function move(e: PointerEvent) {
      const d = current.current;
      if (!d) return;
      if (!drag && e.pointerType === 'mouse') hover(e, d);
      if (!pointers.has(e.pointerId) || !drag) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (drag.mode === 'scroll') {
        // Fingers on the empty page scroll it, as the page takes all touches.
        if (e.pointerType !== 'mouse' && stage.current)
          stage.current.scrollTop = drag.top - (e.clientY - drag.y);
        return;
      }
      if (drag.mode === 'block' || drag.mode === 'resize') {
        const p = mm(e);
        const dx = p.x - drag.x;
        const dy = p.y - drag.y;
        if (!drag.moved && Math.hypot(dx, dy) * perMm() < 3) return;
        drag.moved = true;
        const o = { pageWidth: d.width, gap: d.gap, reach: 10 / perMm() };
        const rest = others(d, drag.id);
        const snapped =
          drag.mode === 'block'
            ? snapMove({ ...drag.start, x: drag.start.x + dx, y: drag.start.y + dy }, rest, o)
            : snapResize(resized(drag.start, drag.edges, dx, dy), drag.edges, rest, o);
        // Kept on the page across; it can grow down as far as it likes.
        const id = drag.id;
        const kind = d.blocks.find((x) => x.id === id)?.kind;
        // Images keep their shape from a corner; an edge crops them.
        const b =
          drag.mode === 'resize' && kind === 'grid'
            ? keepShape(drag.start, snapped.box, drag.edges)
            : snapped.box;
        const x =
          drag.mode === 'block' && b.w <= d.width ? Math.min(d.width - b.w, Math.max(0, b.x)) : b.x;
        const box = { ...b, x, y: Math.max(0, b.y) };
        setGuides(snapped.guides);
        show(
          editBlock(d, id, (old) => {
            const b = { ...old, ...box };
            if (b.kind !== 'text' || drag?.mode !== 'resize') return b;
            // Text keeps to its words: dragging across rewraps it.
            const size = b.text.size * POINT;
            const along = b.text.upright ? b.h : b.w;
            return fitText(b, wrapText(b.text.text, size, Math.max(1, along - size * 0.2)).length);
          }),
        );
        return;
      }
      if (drag.mode === 'side') {
        const dr = drag;
        const bl = layoutDoc(d).blocks.find((b) => b.block.id === dr.id);
        if (!bl?.blot) return;
        const img = bl.blot.image;
        const at = Math.min(1, Math.max(0, (mm(e).y - img.y) / img.h));
        drag.moved = true;
        show(
          editBlock(d, dr.id, (b) =>
            b.kind === 'grid' && b.blot
              ? {
                  ...b,
                  blot: {
                    ...b.blot,
                    [dr.side]: b.blot[dr.side].map((m) => (m.id === dr.label ? { ...m, at } : m)),
                  },
                }
              : b,
          ),
        );
        return;
      }
      if (drag.mode === 'mark' || drag.mode === 'inset') {
        const point = inImage(e, drag.id, d);
        if (!point) return;
        const u = Math.min(1, Math.max(0, point.u));
        const v = Math.min(1, Math.max(0, point.v));
        drag.moved = true;
        const dr = drag;
        show(
          dr.mode === 'mark'
            ? editPanel(d, dr.id, (x) => ({
                ...x,
                marks: x.marks.map((m) => (m.id === dr.mark ? { ...m, u, v } : m)),
              }))
            : editPanel(d, dr.id, (x) => ({
                ...x,
                inset: {
                  u0: Math.min(dr.u, u),
                  v0: Math.min(dr.v, v),
                  u1: Math.max(dr.u, u),
                  v1: Math.max(dr.v, v),
                  corner: x.inset?.corner ?? 'bottom-left',
                  size: x.inset?.size ?? 0.4,
                  colour: x.inset?.colour ?? '#ffffff',
                },
              })),
        );
        return;
      }
      if (pointers.size >= 2) {
        const [a, b] = [...pointers.values()];
        if (!a || !b) return;
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch > 0) {
          const next = setCrop(drag.id, zoomBy(distance / pinch), d);
          if (next) {
            show(next);
            drag.moved = true;
          }
        }
        pinch = distance;
        return;
      }
      const found = findPanel(layoutDoc(d), drag.id);
      if (!found) return;
      const s = perMm();
      const dx = (e.clientX - drag.x) / (found.box.w * s);
      const dy = (e.clientY - drag.y) / (found.box.h * s);
      if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 3) return;
      drag.moved = true;
      const next = setCrop(
        drag.id,
        (crop, b, natural) => panned(crop, dx, dy, sourceRect(natural, b, crop), natural),
        d,
      );
      drag.x = e.clientX;
      drag.y = e.clientY;
      if (next) show(next);
    }

    function up(e: PointerEvent) {
      pointers.delete(e.pointerId);
      if (pointers.size > 0) return;
      const dr = drag;
      drag = null;
      pinch = 0;
      setGuides([]);
      if (!dr || dr.mode === 'scroll') return;
      if (dr.mode === 'inset') setTool('move');
      if (dr.moved && current.current) {
        const after = current.current;
        current.current = dr.before;
        commit(after);
      }
    }

    function wheel(e: WheelEvent) {
      const d = current.current;
      if (!d) return;
      const p = mm(e);
      const hit = blockAt(layoutDoc(d), p.x, p.y);
      // Only a chosen part's images zoom; otherwise the page scrolls.
      if (!hit?.grid || hit.block.id !== selRef.current.block) return;
      const panel = panelAt(hit.grid, p.x, p.y);
      if (!panel?.panel.image) return;
      e.preventDefault();
      const next = setCrop(panel.panel.id, zoomBy(Math.exp(-e.deltaY * 0.0015)), d);
      if (next) commit(next);
    }

    function dblclick() {
      const b = current.current?.blocks.find((x) => x.id === selRef.current.block);
      if (b?.kind === 'text') document.getElementById('fig-text-input')?.focus();
    }

    function key(e: KeyboardEvent) {
      const d = current.current;
      const id = selRef.current.block;
      if (!d || id === null) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        commit(removeBlock(d, id));
        setSel(NONE);
        return;
      }
      if (e.key === 'Escape') {
        setSel(NONE);
        return;
      }
      const step = e.shiftKey ? 5 : 0.5;
      const shifts: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      };
      const shift = shifts[e.key];
      if (!shift) return;
      e.preventDefault();
      const [dx, dy] = shift;
      commit(editBlock(d, id, (b) => ({ ...b, x: b.x + dx, y: Math.max(0, b.y + dy) })));
    }

    c.addEventListener('pointerdown', down);
    c.addEventListener('pointermove', move);
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('wheel', wheel, { passive: false });
    c.addEventListener('dblclick', dblclick);
    c.addEventListener('keydown', key);
    return () => {
      c.removeEventListener('pointerdown', down);
      c.removeEventListener('pointermove', move);
      c.removeEventListener('pointerup', up);
      c.removeEventListener('pointercancel', up);
      c.removeEventListener('wheel', wheel);
      c.removeEventListener('dblclick', dblclick);
      c.removeEventListener('keydown', key);
    };
  }, [commit, status]);

  // ---- Dropping and pasting ----
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const over = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      const files = [...(e.dataTransfer?.files ?? [])];
      if (files.length === 0) return;
      e.preventDefault();
      const c = canvas.current;
      const d = current.current;
      if (!c || !d) return;
      const r = c.getBoundingClientRect();
      const s = r.width / d.width;
      const at = { x: (e.clientX - r.left) / s, y: Math.max(0, (e.clientY - r.top) / s) };
      const hit = blockAt(layoutDoc(d), at.x, at.y);
      const panel = hit?.grid ? panelAt(hit.grid, at.x, at.y) : null;
      void addFiles(files, panel ? { panel: panel.panel.id } : { at });
    };
    const paste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])];
      if (files.length === 0) return;
      e.preventDefault();
      const panel = selRef.current.panels.at(-1);
      void addFiles(files, panel ? { panel } : {});
    };
    el.addEventListener('dragover', over);
    el.addEventListener('drop', drop);
    el.addEventListener('paste', paste);
    return () => {
      el.removeEventListener('dragover', over);
      el.removeEventListener('drop', drop);
      el.removeEventListener('paste', paste);
    };
  }, [addFiles, status]);

  if (status === 'unreadable')
    return <p className="notice">This figure could not be read, so it is left as it is.</p>;
  if (!doc) return <p className="hint">Opening the figure…</p>;

  const block = doc.blocks.find((b) => b.id === sel.block) ?? null;
  const gridBlock: GridBlock | null = block?.kind === 'grid' ? block : null;
  const chosenPanels = gridBlock
    ? gridBlock.grid.panels.filter((p) => sel.panels.includes(p.id))
    : [];
  // A grid of one image goes straight to that image.
  const panelsShown =
    gridBlock && chosenPanels.length === 0 && gridBlock.grid.panels.length === 1
      ? gridBlock.grid.panels
      : chosenPanels;
  const shownLetters = letters(doc);
  const shownLetter = block ? (shownLetters.get(block.id) ?? '') : '';
  const onePanel = panelsShown.length === 1 ? panelsShown[0] : undefined;
  const rowHeight = (() => {
    if (!gridBlock || !onePanel) return null;
    const bl = layoutDoc(doc).blocks.find((b) => b.block.id === gridBlock.id);
    return bl?.grid?.rowHeights[onePanel.row] ?? null;
  })();
  const openPicker = (target: AddTarget) => {
    addTarget.current = target;
    fileInput.current?.click();
  };
  const commitGrid = (g: Grid, grow: boolean) => {
    if (!gridBlock) return;
    commit(withGrid(doc, gridBlock.id, g, grow));
    setSel((s) => ({ ...s, panels: s.panels.filter((id) => g.panels.some((p) => p.id === id)) }));
  };

  return (
    <div className="fig">
      <div className="fig-toolbar" role="toolbar" aria-label="Figure">
        <div className="tool-group" role="group" aria-label="Undo">
          <button
            type="button"
            className="tool"
            title="Undo"
            aria-label="Undo"
            disabled={history.undo === 0}
            onClick={() => {
              stepHistory(true);
            }}
          >
            <Undo2 {...ICON} />
          </button>
          <button
            type="button"
            className="tool"
            title="Redo"
            aria-label="Redo"
            disabled={history.redo === 0}
            onClick={() => {
              stepHistory(false);
            }}
          >
            <Redo2 {...ICON} />
          </button>
        </div>
        <div className="tool-group" role="group" aria-label="Add">
          <button
            type="button"
            className="quiet"
            title="Add images to the page"
            onClick={() => {
              openPicker({});
            }}
          >
            <ImagePlus {...ICON} /> Images
          </button>
          <button
            type="button"
            className="quiet"
            title="Add an empty grid to fill with images"
            onClick={addGrid}
          >
            <Grid2x2 {...ICON} /> Grid
          </button>
          <button
            type="button"
            className="quiet"
            title="Add a graph drawn from data you paste or type in"
            onClick={addChart}
          >
            <ChartColumn {...ICON} /> Graph
          </button>
          <button type="button" className="quiet" title="Add text" onClick={addText}>
            <Type {...ICON} /> Text
          </button>
          <button
            type="button"
            className="quiet"
            title="Add a table of conditions, such as + and − under a graph"
            onClick={addTable}
          >
            <Table2 {...ICON} /> Table
          </button>
          <button
            type="button"
            className="quiet"
            title="Add a line, arrow, bracket or box"
            onClick={addLine}
          >
            <MoveRight {...ICON} /> Line
          </button>
        </div>
        <div className="tool-group fig-export" role="group" aria-label="Export">
          <select
            aria-label="Export as"
            value={format}
            onChange={(e) => {
              const next = (['png', 'tiff', 'svg', 'pdf'] as const).find(
                (x) => x === e.target.value,
              );
              if (next) setFormat(next);
            }}
          >
            <option value="png">PNG</option>
            <option value="tiff">TIFF</option>
            <option value="svg">SVG, editable</option>
            <option value="pdf">PDF</option>
          </select>
          <select
            aria-label="Resolution"
            value={dpi}
            onChange={(e) => {
              setDpi(Number(e.target.value));
            }}
          >
            <option value={300}>300 dpi</option>
            <option value={600}>600 dpi</option>
          </select>
          <button type="button" disabled={busy} onClick={() => void exportFigure()}>
            <Download {...ICON} /> {busy ? 'Exporting…' : 'Export'}
          </button>
          <button
            type="button"
            className="quiet"
            title="How each image was made: files, crops, scale and display"
            onClick={() => {
              const d = current.current;
              if (d) setMethods(methodsNote(d, planes.current, baseName));
            }}
          >
            <FileText {...ICON} /> Methods note
          </button>
        </div>
        <input
          ref={fileInput}
          type="file"
          hidden
          multiple
          // On a tablet an images-only chooser opens the photo picker, which
          // renames files (and so loses names from FIJI). Asking for any file
          // as well opens the file manager, which keeps them.
          accept={
            ctx.platform === 'tablet'
              ? 'application/octet-stream,application/pdf,image/*'
              : 'image/*,.tif,.tiff,.svg,.pdf'
          }
          aria-label="Images to add"
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = '';
            void addFiles(files, addTarget.current);
            addTarget.current = {};
          }}
        />
      </div>
      {exported !== null && (
        <p className="hint fig-exported" role="status">
          Saved {exported.split('/').at(-1)} beside the figure.{' '}
          <button
            type="button"
            className="quiet"
            onClick={() => {
              ctx.app.open(exported).catch(() => undefined);
            }}
          >
            Open it
          </button>
        </p>
      )}
      {methods !== null && (
        <section className="fig-methods" aria-label="Methods note">
          <textarea aria-label="Methods note text" readOnly value={methods} rows={10} />
          <div className="fig-row">
            <button
              type="button"
              className="quiet"
              onClick={() => {
                void navigator.clipboard.writeText(methods).catch(() => undefined);
              }}
            >
              Copy
            </button>
            <button
              type="button"
              className="quiet"
              onClick={() => {
                void (async () => {
                  const name = await ctx.vault.freeName(folder, `${baseName} methods`, '.md');
                  const target = folder === '' ? name : `${folder}/${name}`;
                  await ctx.vault.writeText(target, methods);
                  await ctx.app.open(target);
                })().catch((err: unknown) => {
                  setNotice(
                    `The note could not be saved. ${err instanceof Error ? err.message : String(err)}`,
                  );
                });
              }}
            >
              Save as a page
            </button>
            <button
              type="button"
              className="quiet"
              onClick={() => {
                setMethods(null);
              }}
            >
              Close
            </button>
          </div>
        </section>
      )}
      {saveError !== null && (
        <p className="notice" role="alert">
          {saveError} Your changes are still open.{' '}
          <button
            type="button"
            className="quiet"
            onClick={() => void flush().catch(() => undefined)}
          >
            Retry save
          </button>
        </p>
      )}
      {notice !== null && (
        <p className="notice" role="alert">
          {notice}{' '}
          <button
            type="button"
            className="quiet"
            onClick={() => {
              setNotice(null);
            }}
          >
            Dismiss
          </button>
        </p>
      )}
      <div className="fig-body">
        <div className="fig-stage" ref={stage}>
          <canvas
            ref={canvas}
            className="fig-page"
            tabIndex={0}
            role="img"
            aria-label="The figure. Drop images on the page to add them, drag parts to move them, and drag inside a chosen image to move it in its frame."
          />
        </div>
        <aside className="fig-side" aria-label="Part">
          {!block ? (
            <PageControls doc={doc} tablet={ctx.platform === 'tablet'} onChange={commit} />
          ) : (
            <>
              <h3>
                {block.kind === 'text'
                  ? 'Text'
                  : block.kind === 'table'
                    ? 'Table'
                    : block.kind === 'shape'
                      ? 'Line or shape'
                      : block.kind === 'graphic'
                        ? 'Imported graph'
                        : block.kind === 'chart'
                          ? 'Graph'
                          : block.blot
                            ? 'Blot'
                            : block.grid.panels.length === 1
                              ? 'Image'
                              : 'Grid of images'}
                {shownLetter !== '' ? ` ${shownLetter}` : ''}
              </h3>
              {block.kind === 'chart' && (
                <ChartControls
                  chart={block.chart}
                  onChange={(chart) => {
                    commit(
                      editBlock(doc, block.id, (b) => (b.kind === 'chart' ? { ...b, chart } : b)),
                    );
                  }}
                />
              )}
              {block.kind === 'graphic' && (
                <GraphicControls
                  graphic={block.graphic}
                  pages={graphPages.get(block.graphic.path) ?? 1}
                  onChange={(graphic) => {
                    commit(
                      editBlock(doc, block.id, (b) =>
                        b.kind === 'graphic' ? { ...b, graphic } : b,
                      ),
                    );
                  }}
                  onFit={() => {
                    const source = graphsFor(doc).get(block.id);
                    if (!source) return;
                    const shown = shownRect(source, block.graphic.trim);
                    const strip = block.h - contentBox(doc, block, shownLetter).h;
                    commit(
                      editBlock(doc, block.id, (b) => ({
                        ...b,
                        h: (b.w * shown.h) / shown.w + strip,
                      })),
                    );
                  }}
                />
              )}
              {block.kind === 'table' && (
                <TableControls
                  table={block.table}
                  onChange={(table) => {
                    commit(
                      editBlock(doc, block.id, (b) =>
                        b.kind === 'table' ? { ...b, table, h: tableHeight(table) } : b,
                      ),
                    );
                  }}
                />
              )}
              {block.kind === 'shape' && (
                <ShapeControls
                  shape={block.shape}
                  onChange={(shape) => {
                    commit(
                      editBlock(doc, block.id, (b) => (b.kind === 'shape' ? { ...b, shape } : b)),
                    );
                  }}
                />
              )}
              {block.kind === 'text' && (
                <TextControls
                  text={block.text}
                  onChange={(text) => {
                    commit(
                      editBlock(doc, block.id, (b) => {
                        if (b.kind !== 'text') return b;
                        const along = text.upright ? b.h : b.w;
                        const size = text.size * POINT;
                        const lines = wrapText(text.text, size, Math.max(1, along - size * 0.2));
                        return fitText({ ...b, text }, lines.length);
                      }),
                    );
                  }}
                />
              )}
              {gridBlock && panelsShown.length === 0 && (
                <GridControls
                  grid={gridBlock.grid}
                  onChange={commitGrid}
                  onAddImages={() => {
                    const empty = gridBlock.grid.panels.find((p) => p.image === null);
                    const first = empty ?? gridBlock.grid.panels[0];
                    openPicker(first ? { panel: first.id } : {});
                  }}
                />
              )}
              {gridBlock && panelsShown.length > 0 && (
                <>
                  {gridBlock.grid.panels.length === 1 && onePanel && !onePanel.image && (
                    <button
                      type="button"
                      className="quiet"
                      onClick={() => {
                        openPicker({ panel: onePanel.id });
                      }}
                    >
                      <ImagePlus {...ICON} /> Choose an image
                    </button>
                  )}
                  <PanelControls
                    grid={gridBlock.grid}
                    chosen={panelsShown}
                    planes={readImages}
                    tool={tool}
                    selectedMark={selectedMark}
                    rowHeight={rowHeight}
                    onTool={setTool}
                    onSelectMark={setSelectedMark}
                    onChange={commitGrid}
                    onBack={() => {
                      setSel({ block: gridBlock.id, panels: [] });
                    }}
                    onNotice={setNotice}
                  />
                  {gridBlock.grid.panels.length === 1 && (
                    <BlotControls
                      blot={gridBlock.blot}
                      onChange={(blot) => {
                        // Labels above the image add room, rather than squeeze it.
                        const size = gridBlock.grid.labelSize * POINT;
                        const was = gridBlock.blot ? blotTop(gridBlock.blot, size) : 0;
                        const now = blot ? blotTop(blot, size) : 0;
                        commit(
                          editBlock(doc, gridBlock.id, (b) =>
                            b.kind === 'grid' ? { ...b, blot, h: Math.max(4, b.h + now - was) } : b,
                          ),
                        );
                      }}
                    />
                  )}
                </>
              )}
              <BlockControls
                block={block}
                shownLetter={shownLetter}
                pageWidth={doc.width}
                onChange={(b) => {
                  commit(editBlock(doc, block.id, () => b));
                }}
                onDuplicate={() => {
                  const out = duplicate(doc, block.id);
                  commit(out.doc);
                  setSel({ block: out.id, panels: [] });
                }}
                onRestack={(front) => {
                  commit(restack(doc, block.id, front));
                }}
                onRemove={() => {
                  commit(removeBlock(doc, block.id));
                  setSel(NONE);
                }}
              />
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
