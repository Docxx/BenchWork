import {
  Columns3,
  FlipHorizontal2,
  ImagePlus,
  Merge,
  Minus,
  Plus,
  Redo2,
  RotateCw,
  Rows3,
  SplitSquareHorizontal,
  Trash2,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ModuleContext } from '@core/api';
import {
  DEFAULT_CROP,
  fillWith,
  insertLine,
  layout,
  merge,
  PAGE_WIDTHS,
  panelAt,
  panned,
  parseFigure,
  removeLine,
  serialiseFigure,
  sourceRect,
  split,
  newId,
  type Crop,
  type Figure,
  type Mark,
  type MarkKind,
  type Panel,
} from './model';
import { FigureLabels, PanelLabels } from './LabelControls';
import { DisplayControls, ScaleControls } from './DisplayControls';
import { MarkControls } from './MarkControls';
import { boxToImage, imageToBox } from './marks';
import { loadPlanes, picture, showsFor } from './images';
import { drawFigure, FIGURE_FONT, type Source } from './render';
import type { Planes } from './tiff';
import './figures.css';

const ICON = { size: 17, strokeWidth: 1.8, 'aria-hidden': true } as const;
const SAVE_MS = 500;
const MAX_UNDO = 60;
const IMAGE_TYPES = /\.(png|jpe?g|gif|webp|bmp|tiff?)$/i;

const dirOf = (path: string) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');

/**
 * A figure, laid out on a page of real size. Drop images onto panels (or
 * anywhere, to fill the empty ones in order); drag inside a panel to move
 * its image, and zoom with the wheel or a pinch. The grid's rows, columns
 * and gaps are set beside it.
 */
export function FigureEditor({ ctx, path }: { ctx: ModuleContext; path: string }) {
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [figure, setFigure] = useState<Figure | null>(null);
  const [status, setStatus] = useState<'reading' | 'ready' | 'unreadable'>('reading');
  const [selected, setSelected] = useState<string[]>([]);
  /** What pressing a panel does: move its image, place a mark, or draw an inset's region. */
  const [tool, setTool] = useState<'move' | MarkKind | 'inset'>('move');
  const toolRef = useRef(tool);
  useEffect(() => {
    toolRef.current = tool;
  }, [tool]);
  const [selectedMark, setSelectedMark] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [history, setHistory] = useState({ undo: 0, redo: 0 });
  const [loaded, setLoaded] = useState(0);
  /** The images read so far, for the controls beside the page. */
  const [readImages, setReadImages] = useState<ReadonlyMap<string, Planes>>(new Map());
  const [fit, setFit] = useState({ scale: 3, width: 600 });

  const current = useRef<Figure | null>(null);
  const undo = useRef<Figure[]>([]);
  const redo = useRef<Figure[]>([]);
  const lastText = useRef<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Each image file's values, once read. */
  const planes = useRef(new Map<string, Planes>());
  const loading = useRef(new Set<string>());
  /** Pictures already made, by file and how it is shown. */
  const pictures = useRef(new Map<string, HTMLCanvasElement>());

  // ---- Saving ----
  const save = useCallback(
    (next: Figure) => {
      if (saveTimer.current !== null) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        saveTimer.current = null;
        const text = serialiseFigure(next);
        if (text === lastText.current) return;
        lastText.current = text;
        ctx.vault.writeText(path, text).catch((err: unknown) => {
          setNotice(
            `This figure could not be saved. ${err instanceof Error ? err.message : String(err)}`,
          );
        });
      }, SAVE_MS);
    },
    [ctx, path],
  );

  /** Puts a change in place: kept for undo, shown and saved. */
  const commit = useCallback(
    (next: Figure, remember = true) => {
      const before = current.current;
      if (remember && before) {
        undo.current.push(before);
        if (undo.current.length > MAX_UNDO) undo.current.shift();
        redo.current = [];
      }
      current.current = next;
      setFigure(next);
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
    setFigure(next);
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
          const f = current.current;
          if (read.umPerPx === null || !f) return;
          const missing = f.panels.some((p) => p.image?.path === file && p.image.umPerPx === null);
          if (!missing) return;
          const next = {
            ...f,
            panels: f.panels.map((p) =>
              p.image?.path === file && p.image.umPerPx === null
                ? { ...p, image: { ...p.image, umPerPx: read.umPerPx } }
                : p,
            ),
          };
          current.current = next;
          setFigure(next);
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

  useEffect(() => {
    for (const p of figure?.panels ?? []) if (p.image) loadImage(p.image.path);
  }, [figure, loadImage]);

  // ---- Reading, and following changes made elsewhere ----
  useEffect(() => {
    let live = true;
    const read = async () => {
      const text = await ctx.vault.readText(path);
      if (!live || text === lastText.current) return;
      const parsed = parseFigure(text);
      if (parsed === null) {
        setStatus('unreadable');
        return;
      }
      lastText.current = text;
      current.current = parsed;
      setFigure(parsed);
      setStatus('ready');
    };
    void read().catch(() => {
      if (live) setStatus('unreadable');
    });
    const watch = ctx.vault.watch((change) => {
      if (change.paths.includes(path) && saveTimer.current === null)
        void read().catch(() => undefined);
    });
    return () => {
      live = false;
      watch.dispose();
    };
  }, [ctx, path]);

  useEffect(
    () => () => {
      if (saveTimer.current === null || !current.current) return;
      clearTimeout(saveTimer.current);
      const text = serialiseFigure(current.current);
      if (text !== lastText.current) void ctx.vault.writeText(path, text).catch(() => undefined);
    },
    [ctx, path],
  );

  // ---- Fitting the page to the room ----
  useEffect(() => {
    const el = stage.current;
    if (!el || !figure) return;
    const measure = () => {
      const box = el.getBoundingClientRect();
      const l = layout(figure);
      const scale = Math.max(0.5, Math.min((box.width - 48) / l.width, 12));
      setFit({ scale, width: box.width });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, [figure]);

  // ---- Drawing ----
  useEffect(() => {
    const c = canvas.current;
    const g = c?.getContext('2d');
    if (!c || !g || !figure) return;
    const l = layout(figure);
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(l.width * fit.scale * ratio);
    c.height = Math.round(l.height * fit.scale * ratio);
    c.style.width = `${String(l.width * fit.scale)}px`;
    c.style.height = `${String(l.height * fit.scale)}px`;
    g.setTransform(ratio, 0, 0, ratio, 0, 0);
    // Each panel's picture, shown as its group says; made once and kept.
    const sources = new Map<string, Source>();
    for (const panel of figure.panels) {
      const read = panel.image ? planes.current.get(panel.image.path) : undefined;
      if (!panel.image || !read) continue;
      const shows = showsFor(figure, panel, read, planes.current);
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
    drawFigure(g, figure, {
      scale: fit.scale,
      sources,
      editing: true,
      selected: selected.at(-1) ?? null,
      selectedMark,
      font: FIGURE_FONT,
      accent: getComputedStyle(c).getPropertyValue('--accent').trim() || '#2f5fb3',
    });
  }, [figure, fit, selected, selectedMark, loaded]);

  // ---- Adding images ----
  const addFiles = useCallback(
    async (files: readonly File[], onto?: string) => {
      const f = current.current;
      if (!f) return;
      const folder = `${dirOf(path)}${dirOf(path) === '' ? '' : '/'}attachments`;
      const added: string[] = [];
      try {
        for (const file of files) {
          if (!IMAGE_TYPES.test(file.name) && !file.type.startsWith('image/')) {
            setNotice(`${file.name} is not an image BenchWork can show yet.`);
            continue;
          }
          await ctx.vault.ensureDir(folder);
          const stem =
            file.name.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|#^[\]]+/g, '-') || 'image';
          const ext = /\.[a-z0-9]+$/i.exec(file.name)?.[0].toLowerCase() ?? '.png';
          const name = await ctx.vault.freeName(folder, stem, ext);
          const target = `${folder}/${name}`;
          await ctx.vault.writeBytes(target, new Uint8Array(await file.arrayBuffer()));
          added.push(target);
        }
      } catch (err) {
        setNotice(`That could not be added. ${err instanceof Error ? err.message : String(err)}`);
      }
      if (added.length > 0) commit(fillWith(current.current ?? f, added, onto));
    },
    [ctx, path, commit],
  );

  // ---- Pointer: choosing panels, moving and zooming images ----
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const pointers = new Map<number, { x: number; y: number }>();
    let drag:
      | { mode: 'crop'; id: string; x: number; y: number; before: Figure; moved: boolean }
      | {
          mode: 'mark';
          id: string;
          mark: string;
          x: number;
          y: number;
          before: Figure;
          moved: boolean;
        }
      | {
          mode: 'inset';
          id: string;
          u: number;
          v: number;
          x: number;
          y: number;
          before: Figure;
          moved: boolean;
        }
      | null = null;
    let pinch = 0;
    const mm = (e: { clientX: number; clientY: number }) => {
      const r = c.getBoundingClientRect();
      const scale = r.width / (current.current ? layout(current.current).width : 1);
      return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
    };
    const hit = (e: { clientX: number; clientY: number }) => {
      const f = current.current;
      if (!f) return null;
      const p = mm(e);
      return panelAt(layout(f), p.x, p.y);
    };
    const setCrop = (
      id: string,
      change: (
        crop: Crop,
        box: { w: number; h: number },
        natural: { w: number; h: number },
      ) => Crop,
      base: Figure,
    ) => {
      const box = layout(base).panels.find((p) => p.panel.id === id);
      const panel = box?.panel;
      const read = panel?.image ? planes.current.get(panel.image.path) : undefined;
      if (!box || !panel?.image || !read) return null;
      const crop = change(panel.image.crop, box, { w: read.width, h: read.height });
      return {
        ...base,
        panels: base.panels.map((p) =>
          p.id === id && p.image ? { ...p, image: { ...p.image, crop } } : p,
        ),
      };
    };

    /** Where a pointer is in a panel's image, with that panel's box and the image's size. */
    const inImage = (e: { clientX: number; clientY: number }, id: string, base: Figure) => {
      const box = layout(base).panels.find((p) => p.panel.id === id);
      const read = box?.panel.image ? planes.current.get(box.panel.image.path) : undefined;
      if (!box?.panel.image || !read) return null;
      const natural = { w: read.width, h: read.height };
      const at = mm(e);
      return { ...boxToImage(at.x, at.y, natural, box, box.panel.image.crop), box, natural };
    };
    const editPanel = (base: Figure, id: string, change: (p: Panel) => Panel): Figure => ({
      ...base,
      panels: base.panels.map((p) => (p.id === id ? change(p) : p)),
    });

    function down(e: PointerEvent) {
      c?.focus();
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      c?.setPointerCapture(e.pointerId);
      const target = hit(e);
      const f = current.current;
      if (!target || !f) {
        setSelected([]);
        setSelectedMark(null);
        return;
      }
      if (e.shiftKey || e.ctrlKey || e.metaKey) {
        setSelected((s) =>
          s.includes(target.panel.id)
            ? s.filter((x) => x !== target.panel.id)
            : [...s, target.panel.id],
        );
        return;
      }
      setSelected([target.panel.id]);
      pinch = 0;
      const id = target.panel.id;
      const point = inImage(e, id, f);
      const tool = toolRef.current;
      if (point && tool !== 'move' && tool !== 'inset') {
        // A new mark where the panel was pressed; the tool goes back to moving.
        const mark: Mark = {
          id: newId(),
          kind: tool,
          u: point.u,
          v: point.v,
          angle: 135,
          size: tool === 'text' ? 8 : 10,
          colour: '#ffffff',
          text: tool === 'text' ? 'Text' : '',
        };
        commit(editPanel(f, id, (p) => ({ ...p, marks: [...p.marks, mark] })));
        setSelectedMark(mark.id);
        setTool('move');
        return;
      }
      if (point && tool === 'inset') {
        drag = { mode: 'inset', id, u: point.u, v: point.v, before: f, moved: false, x: 0, y: 0 };
        return;
      }
      // A mark under the pointer is picked up and moved.
      if (point) {
        const near = target.panel.marks.find((m) => {
          const at = imageToBox(
            m.u,
            m.v,
            point.natural,
            point.box,
            target.panel.image?.crop ?? DEFAULT_CROP,
          );
          const here = mm(e);
          return at !== null && Math.hypot(at.x - here.x, at.y - here.y) < 3;
        });
        if (near) {
          setSelectedMark(near.id);
          drag = { mode: 'mark', id, mark: near.id, before: f, moved: false, x: 0, y: 0 };
          return;
        }
      }
      setSelectedMark(null);
      drag = { mode: 'crop', id, x: e.clientX, y: e.clientY, before: f, moved: false };
    }

    function move(e: PointerEvent) {
      if (!pointers.has(e.pointerId) || !drag) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const f = current.current;
      if (!f) return;
      if (drag.mode === 'mark' || drag.mode === 'inset') {
        const point = inImage(e, drag.id, f);
        if (!point) return;
        const u = Math.min(1, Math.max(0, point.u));
        const v = Math.min(1, Math.max(0, point.v));
        drag.moved = true;
        const d = drag;
        const next =
          d.mode === 'mark'
            ? editPanel(f, d.id, (p) => ({
                ...p,
                marks: p.marks.map((m) => (m.id === d.mark ? { ...m, u, v } : m)),
              }))
            : editPanel(f, d.id, (p) => ({
                ...p,
                inset: {
                  u0: Math.min(d.u, u),
                  v0: Math.min(d.v, v),
                  u1: Math.max(d.u, u),
                  v1: Math.max(d.v, v),
                  corner: p.inset?.corner ?? 'bottom-left',
                  size: p.inset?.size ?? 0.4,
                  colour: p.inset?.colour ?? '#ffffff',
                },
              }));
        current.current = next;
        setFigure(next);
        return;
      }
      if (pointers.size >= 2) {
        const [a, b] = [...pointers.values()];
        if (!a || !b) return;
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch > 0) {
          const factor = distance / pinch;
          const next = setCrop(
            drag.id,
            (crop) => ({ ...crop, zoom: Math.min(40, Math.max(1, crop.zoom * factor)) }),
            f,
          );
          if (next) {
            current.current = next;
            setFigure(next);
            drag.moved = true;
          }
        }
        pinch = distance;
        return;
      }
      const box = layout(f).panels.find((p) => p.panel.id === drag?.id);
      if (!box) return;
      const r = c?.getBoundingClientRect();
      const scale = r ? r.width / layout(f).width : 1;
      const dx = (e.clientX - drag.x) / (box.w * scale);
      const dy = (e.clientY - drag.y) / (box.h * scale);
      if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 3) return;
      drag.moved = true;
      const next = setCrop(
        drag.id,
        (crop, b, natural) => panned(crop, dx, dy, sourceRect(natural, b, crop), natural),
        f,
      );
      drag.x = e.clientX;
      drag.y = e.clientY;
      if (next) {
        current.current = next;
        setFigure(next);
      }
    }

    function up(e: PointerEvent) {
      pointers.delete(e.pointerId);
      if (pointers.size > 0) return;
      const d = drag;
      drag = null;
      pinch = 0;
      if (d?.mode === 'inset') setTool('move');
      if (d?.moved && current.current) {
        const after = current.current;
        current.current = d.before;
        commit(after);
      }
    }

    function wheel(e: WheelEvent) {
      const target = hit(e);
      const f = current.current;
      if (!target?.panel.image || !f) return;
      e.preventDefault();
      const factor = Math.exp(-e.deltaY * 0.0015);
      const next = setCrop(
        target.panel.id,
        (crop) => ({ ...crop, zoom: Math.min(40, Math.max(1, crop.zoom * factor)) }),
        f,
      );
      if (next) commit(next);
    }

    c.addEventListener('pointerdown', down);
    c.addEventListener('pointermove', move);
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('wheel', wheel, { passive: false });
    return () => {
      c.removeEventListener('pointerdown', down);
      c.removeEventListener('pointermove', move);
      c.removeEventListener('pointerup', up);
      c.removeEventListener('pointercancel', up);
      c.removeEventListener('wheel', wheel);
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
      const f = current.current;
      let onto: string | undefined;
      if (c && f) {
        const r = c.getBoundingClientRect();
        const scale = r.width / layout(f).width;
        onto = panelAt(layout(f), (e.clientX - r.left) / scale, (e.clientY - r.top) / scale)?.panel
          .id;
      }
      void addFiles(files, onto);
    };
    const paste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])];
      if (files.length === 0) return;
      e.preventDefault();
      void addFiles(files, selected.at(-1));
    };
    el.addEventListener('dragover', over);
    el.addEventListener('drop', drop);
    el.addEventListener('paste', paste);
    return () => {
      el.removeEventListener('dragover', over);
      el.removeEventListener('drop', drop);
      el.removeEventListener('paste', paste);
    };
  }, [addFiles, selected]);

  if (status === 'unreadable')
    return <p className="notice">This figure could not be read, so it is left as it is.</p>;
  if (!figure) return <p className="hint">Opening the figure…</p>;

  const chosen = figure.panels.filter((p) => selected.includes(p.id));
  const one: Panel | undefined = chosen.length === 1 ? chosen[0] : undefined;
  const editPanels = (change: (p: Panel) => Panel) => {
    commit({
      ...figure,
      panels: figure.panels.map((p) => (selected.includes(p.id) ? change(p) : p)),
    });
  };
  const editCrop = (change: (c: Crop) => Crop) => {
    editPanels((p) => (p.image ? { ...p, image: { ...p.image, crop: change(p.image.crop) } } : p));
  };
  const block = (() => {
    if (chosen.length < 2) return null;
    const row = Math.min(...chosen.map((p) => p.row));
    const col = Math.min(...chosen.map((p) => p.col));
    const rowEnd = Math.max(...chosen.map((p) => p.row + p.rowSpan));
    const colEnd = Math.max(...chosen.map((p) => p.col + p.colSpan));
    return { row, col, rowSpan: rowEnd - row, colSpan: colEnd - col };
  })();
  const lastRow = one ? one.row + one.rowSpan - 1 : figure.rows.length - 1;
  const lastCol = one ? one.col + one.colSpan - 1 : figure.cols.length - 1;

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
        <label className="fig-field">
          Width
          <select
            aria-label="Page width"
            value={PAGE_WIDTHS.find((w) => w.width === figure.width)?.width ?? 'own'}
            onChange={(e) => {
              if (e.target.value !== 'own') commit({ ...figure, width: Number(e.target.value) });
            }}
          >
            {PAGE_WIDTHS.map((w) => (
              <option key={w.width} value={w.width}>
                {w.name}, {w.width} mm
              </option>
            ))}
            {!PAGE_WIDTHS.some((w) => w.width === figure.width) && (
              <option value="own">{figure.width} mm</option>
            )}
          </select>
        </label>
        <label className="fig-field">
          Gap
          <input
            type="number"
            aria-label="Gap between panels, mm"
            min={0}
            max={20}
            step={0.5}
            value={figure.gap}
            onChange={(e) => {
              const gap = Number(e.target.value);
              if (Number.isFinite(gap) && gap >= 0 && gap <= 20) commit({ ...figure, gap });
            }}
          />
          mm
        </label>
        <div className="tool-group" role="group" aria-label="Rows and columns">
          <Rows3 {...ICON} />
          <button
            type="button"
            className="tool"
            title="Add a row"
            aria-label="Add a row"
            onClick={() => {
              commit(insertLine(figure, 'row', lastRow));
            }}
          >
            <Plus {...ICON} />
          </button>
          <button
            type="button"
            className="tool"
            title="Remove a row"
            aria-label="Remove a row"
            disabled={figure.rows.length <= 1}
            onClick={() => {
              commit(removeLine(figure, 'row', lastRow));
            }}
          >
            <Minus {...ICON} />
          </button>
          <Columns3 {...ICON} />
          <button
            type="button"
            className="tool"
            title="Add a column"
            aria-label="Add a column"
            onClick={() => {
              commit(insertLine(figure, 'col', lastCol));
            }}
          >
            <Plus {...ICON} />
          </button>
          <button
            type="button"
            className="tool"
            title="Remove a column"
            aria-label="Remove a column"
            disabled={figure.cols.length <= 1}
            onClick={() => {
              commit(removeLine(figure, 'col', lastCol));
            }}
          >
            <Minus {...ICON} />
          </button>
        </div>
        <button type="button" className="quiet" onClick={() => fileInput.current?.click()}>
          <ImagePlus {...ICON} /> Add images
        </button>
        <input
          ref={fileInput}
          type="file"
          hidden
          multiple
          accept="image/*,.tif,.tiff"
          aria-label="Images to add"
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = '';
            void addFiles(files, selected.at(-1));
          }}
        />
      </div>
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
            aria-label="The figure. Drop images onto panels; drag inside a panel to move its image, and zoom with the wheel or a pinch."
          />
        </div>
        <aside className="fig-side" aria-label="Panel">
          {chosen.length === 0 ? (
            <>
              <p className="hint">
                Choose a panel to crop, turn or name its channels. Drop several images to fill the
                empty panels in order. Shift-click to choose more than one.
              </p>
              <FigureLabels figure={figure} onChange={commit} />
            </>
          ) : (
            <>
              <h3>{chosen.length === 1 ? 'Panel' : `${String(chosen.length)} panels`}</h3>
              {one?.image && (
                <p className="fig-file" title={one.image.path}>
                  {one.image.path.split('/').at(-1)}
                </p>
              )}
              <div className="tool-group" role="group" aria-label="Image">
                <button
                  type="button"
                  className="tool"
                  title="Zoom out"
                  aria-label="Zoom out"
                  onClick={() => {
                    editCrop((c) => ({ ...c, zoom: Math.max(1, c.zoom / 1.25) }));
                  }}
                >
                  <ZoomOut {...ICON} />
                </button>
                <button
                  type="button"
                  className="tool"
                  title="Zoom in"
                  aria-label="Zoom in"
                  onClick={() => {
                    editCrop((c) => ({ ...c, zoom: Math.min(40, c.zoom * 1.25) }));
                  }}
                >
                  <ZoomIn {...ICON} />
                </button>
                <button
                  type="button"
                  className="tool"
                  title="Turn a quarter"
                  aria-label="Turn a quarter"
                  onClick={() => {
                    editCrop((c) => ({ ...c, turns: ((c.turns + 1) % 4) as Crop['turns'] }));
                  }}
                >
                  <RotateCw {...ICON} />
                </button>
                <button
                  type="button"
                  className="tool"
                  title="Flip"
                  aria-label="Flip"
                  onClick={() => {
                    editCrop((c) => ({ ...c, flip: !c.flip }));
                  }}
                >
                  <FlipHorizontal2 {...ICON} />
                </button>
                <button
                  type="button"
                  className="quiet"
                  onClick={() => {
                    editCrop(() => ({ ...DEFAULT_CROP }));
                  }}
                >
                  Reset
                </button>
              </div>
              <DisplayControls
                figure={figure}
                panels={chosen}
                planes={readImages}
                onChange={commit}
              />
              <ScaleControls figure={figure} panels={chosen} onChange={commit} />
              {one?.image && (
                <MarkControls
                  panel={one}
                  tool={tool}
                  selectedMark={selectedMark}
                  onTool={setTool}
                  onSelectMark={setSelectedMark}
                  onChange={(panel) => {
                    commit({
                      ...figure,
                      panels: figure.panels.map((p) => (p.id === panel.id ? panel : p)),
                    });
                  }}
                />
              )}
              <PanelLabels
                panels={chosen}
                onChange={(labels) => {
                  editPanels((p) => ({ ...p, labels }));
                }}
              />
              {chosen.length > 1 && (
                <button
                  type="button"
                  className="quiet"
                  title="Copy the first panel's zoom to the others, so they match"
                  onClick={() => {
                    const zoom = chosen[0]?.image?.crop.zoom ?? 1;
                    editCrop((c) => ({ ...c, zoom }));
                  }}
                >
                  Match zoom
                </button>
              )}
              <div className="tool-group" role="group" aria-label="Arrange">
                {block !== null && (
                  <button
                    type="button"
                    className="quiet"
                    onClick={() => {
                      const next = merge(figure, block);
                      if (next) {
                        commit(next);
                        setSelected([]);
                      } else
                        setNotice(
                          'Those panels cannot be joined: the block would cut through another panel.',
                        );
                    }}
                  >
                    <Merge {...ICON} /> Join
                  </button>
                )}
                {one && (one.rowSpan > 1 || one.colSpan > 1) && (
                  <button
                    type="button"
                    className="quiet"
                    onClick={() => {
                      commit(split(figure, one.id));
                    }}
                  >
                    <SplitSquareHorizontal {...ICON} /> Split
                  </button>
                )}
                <button
                  type="button"
                  className="quiet"
                  onClick={() => {
                    editPanels((p) => ({ ...p, image: null }));
                  }}
                >
                  <Trash2 {...ICON} /> Remove image
                </button>
              </div>
              {one && (
                <label className="fig-field">
                  Row height
                  <input
                    type="number"
                    aria-label="Row height, mm"
                    min={5}
                    max={400}
                    step={1}
                    value={Math.round((figure.rows[one.row] ?? 0) * 10) / 10}
                    onChange={(e) => {
                      const h = Number(e.target.value);
                      if (Number.isFinite(h) && h >= 5 && h <= 400) {
                        commit({
                          ...figure,
                          rows: figure.rows.map((r, i) => (i === one.row ? h : r)),
                        });
                      }
                    }}
                  />
                  mm
                </label>
              )}
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
