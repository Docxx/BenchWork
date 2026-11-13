import {
  ArrowUpRight,
  BringToFront,
  Circle,
  Copy,
  Eraser,
  Hand,
  Highlighter,
  ImagePlus,
  LassoSelect,
  Maximize,
  Minus,
  Pencil,
  PenLine,
  PenTool,
  Plus,
  Redo2,
  SendToBack,
  Slash,
  Square,
  Star,
  StickyNote,
  Trash2,
  Type,
  Undo2,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { isScribble, type ModuleContext } from '@core/api';
import {
  boundsOf,
  boundsOfAll,
  duplicated,
  emptyBoard,
  hits,
  itemAt,
  lassoed,
  moved,
  newId,
  parseBoard,
  resized,
  serialiseBoard,
  tidied,
  withJoinsFollowed,
  type BoardItem,
  type Box,
  type PenKind,
  type ShapeKind,
  type StrokeItem,
} from './model';
import { drawBoard, drawDots, drawItem, toBoard, toScreen, viewToFit, type View } from './render';
import './whiteboard.css';

type Tool = 'select' | 'hand' | PenKind | 'eraser' | 'shape' | 'text' | 'note';

interface PenStyle {
  colour: string;
  width: number;
}

interface SavedPen extends PenStyle {
  pen: PenKind;
}

const PENS: { pen: PenKind; label: string; icon: LucideIcon }[] = [
  { pen: 'pen', label: 'Pen', icon: PenLine },
  { pen: 'pencil', label: 'Pencil', icon: Pencil },
  { pen: 'marker', label: 'Marker', icon: PenTool },
  { pen: 'highlighter', label: 'Highlighter', icon: Highlighter },
];

const SHAPES: { shape: ShapeKind; label: string; icon: LucideIcon }[] = [
  { shape: 'rect', label: 'Box', icon: Square },
  { shape: 'ellipse', label: 'Ellipse', icon: Circle },
  { shape: 'line', label: 'Line', icon: Slash },
  { shape: 'arrow', label: 'Arrow', icon: ArrowUpRight },
];

const COLOURS = [
  { name: 'Ink', value: '#1d2725' },
  { name: 'Blue', value: '#2f5fb3' },
  { name: 'Red', value: '#c0392b' },
  { name: 'Green', value: '#2e7d4f' },
  { name: 'Purple', value: '#7d5ba6' },
  { name: 'Orange', value: '#d9822b' },
  { name: 'Yellow', value: '#ffd84d' },
  { name: 'Pink', value: '#ff8fab' },
];

const NOTE_COLOURS = ['#ffe58a', '#b9e6c9', '#bcd7f5', '#f7c1d0', '#e0cdf3'];

const START: Record<PenKind, PenStyle> = {
  pen: { colour: '#1d2725', width: 2.5 },
  pencil: { colour: '#1d2725', width: 2 },
  marker: { colour: '#2f5fb3', width: 7 },
  highlighter: { colour: '#ffd84d', width: 18 },
};

const ICON = { size: 17, strokeWidth: 1.8, 'aria-hidden': true } as const;
/** Still for this long at the end of a stroke, and a rough shape is tidied. */
const HOLD_MS = 450;
const SAVE_MS = 500;
const HANDLE = 10;
const MAX_UNDO = 80;
const MAX_IMAGE = 480;
const PDF_PAGES = 30;

const isPen = (tool: Tool): tool is PenKind =>
  tool === 'pen' || tool === 'pencil' || tool === 'marker' || tool === 'highlighter';

function parseSavedPens(raw: unknown): SavedPen[] {
  if (!Array.isArray(raw)) return [];
  return (raw as unknown[])
    .filter((p): p is SavedPen => {
      if (typeof p !== 'object' || p === null) return false;
      const r = p as Record<string, unknown>;
      return (
        PENS.some((k) => k.pen === r['pen']) &&
        typeof r['colour'] === 'string' &&
        /^#[0-9a-f]{6}$/i.test(r['colour']) &&
        typeof r['width'] === 'number'
      );
    })
    .slice(0, 10);
}

const dirOf = (path: string) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');

/**
 * A whiteboard: an endless board to write and draw on with the pen, a
 * finger or the mouse. Pens with pressure, shapes that tidy themselves,
 * text, sticky notes, images and PDF pages; a lasso to move, resize, copy
 * and recolour; undo; and a small map of the whole board. Saved as it
 * changes.
 */
export function Board({ ctx, path }: { ctx: ModuleContext; path: string }) {
  const stage = useRef<HTMLDivElement>(null);
  const base = useRef<HTMLCanvasElement>(null);
  const top = useRef<HTMLCanvasElement>(null);
  const map = useRef<HTMLCanvasElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const [tool, setTool] = useState<Tool>('pen');
  const [styles, setStyles] = useState(START);
  const [shape, setShape] = useState<ShapeKind>('rect');
  const [shapeStyle, setShapeStyle] = useState<PenStyle>({ colour: '#1d2725', width: 2 });
  const [selection, setSelection] = useState<string[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [history, setHistory] = useState({ undo: 0, redo: 0 });
  const [saved, setSaved] = useState<SavedPen[]>([]);
  const [status, setStatus] = useState<'reading' | 'ready' | 'unreadable'>('reading');
  const [notice, setNotice] = useState<string | null>(null);
  /** Goes up when the board is drawn again, so overlays in the page follow. */
  const [, setTick] = useState(0);

  // What the pointer handlers read: kept in refs, so they are set up once.
  const items = useRef<BoardItem[]>([]);
  const view = useRef<View>({ x: 0, y: 0, zoom: 1 });
  const size = useRef({ w: 1, h: 1 });
  const undo = useRef<BoardItem[][]>([]);
  const redo = useRef<BoardItem[][]>([]);
  const images = useRef(new Map<string, HTMLImageElement>());
  const lastText = useRef<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const penSeen = useRef(false);
  const clipboard = useRef<BoardItem[]>([]);
  const now = useRef({ tool, styles, shape, shapeStyle, selection, editing });
  useEffect(() => {
    now.current = { tool, styles, shape, shapeStyle, selection, editing };
  }, [tool, styles, shape, shapeStyle, selection, editing]);
  /** What is being drawn or dragged now, shown on the top canvas. */
  const live = useRef<{
    stroke?: StrokeItem;
    shape?: BoardItem;
    lasso?: [number, number][];
  }>({});
  const frame = useRef(0);

  const dark = () => getComputedStyle(document.documentElement).colorScheme.includes('dark');

  // ---- Drawing ----
  const paint = useCallback(() => {
    frame.current = 0;
    const b = base.current,
      t = top.current;
    const c = b?.getContext('2d'),
      o = t?.getContext('2d');
    if (!b || !t || !c || !o) return;
    const { w, h } = size.current;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const css = getComputedStyle(b);
    const options = {
      dark: dark(),
      images: images.current,
      editing: now.current.editing,
      font: css.fontFamily || 'sans-serif',
    };
    c.setTransform(ratio, 0, 0, ratio, 0, 0);
    c.clearRect(0, 0, w, h);
    drawDots(c, view.current, w, h, css.getPropertyValue('--wb-dot').trim() || '#8884');
    drawBoard(c, items.current, view.current, w, h, options);

    o.setTransform(ratio, 0, 0, ratio, 0, 0);
    o.clearRect(0, 0, w, h);
    const v = view.current;
    o.save();
    o.scale(v.zoom, v.zoom);
    o.translate(-v.x, -v.y);
    if (live.current.stroke) drawItem(o, live.current.stroke, options);
    if (live.current.shape) drawItem(o, live.current.shape, options);
    o.restore();
    const accent = css.getPropertyValue('--accent').trim() || '#2f5fb3';
    const lasso = live.current.lasso;
    if (lasso && lasso.length > 1) {
      o.save();
      o.strokeStyle = accent;
      o.setLineDash([5, 4]);
      o.beginPath();
      lasso.forEach(([x, y], i) => {
        const [sx, sy] = toScreen(v, x, y);
        if (i === 0) o.moveTo(sx, sy);
        else o.lineTo(sx, sy);
      });
      o.stroke();
      o.restore();
    }
    const box = selectionBox();
    if (box) {
      const [x, y] = toScreen(v, box.x, box.y);
      const bw = box.w * v.zoom,
        bh = box.h * v.zoom;
      o.save();
      o.strokeStyle = accent;
      o.lineWidth = 1.5;
      o.setLineDash([6, 4]);
      o.strokeRect(x - 4, y - 4, bw + 8, bh + 8);
      o.setLineDash([]);
      o.fillStyle = '#fff';
      for (const [hx, hy] of [
        [x - 4, y - 4],
        [x + bw + 4, y - 4],
        [x - 4, y + bh + 4],
        [x + bw + 4, y + bh + 4],
      ] as const) {
        o.fillRect(hx - HANDLE / 2, hy - HANDLE / 2, HANDLE, HANDLE);
        o.strokeRect(hx - HANDLE / 2, hy - HANDLE / 2, HANDLE, HANDLE);
      }
      o.restore();
    }
    paintMap(accent);
    setZoom(v.zoom);
    setTick((n) => n + 1);
  }, []);

  const redraw = useCallback(() => {
    if (frame.current === 0) frame.current = requestAnimationFrame(paint);
  }, [paint]);

  function selectionBox(): Box | null {
    const ids = now.current.selection;
    if (ids.length === 0) return null;
    return boundsOfAll(items.current.filter((i) => ids.includes(i.id)));
  }

  /** The small map: everything on the board, and the part in view. */
  function paintMap(accent: string) {
    const m = map.current;
    const c = m?.getContext('2d');
    if (!m || !c) return;
    const { w, h } = size.current;
    const v = view.current;
    const [vx, vy] = toBoard(v, 0, 0);
    const seen: Box = { x: vx, y: vy, w: w / v.zoom, h: h / v.zoom };
    const all = boundsOfAll(items.current);
    const x1 = Math.min(seen.x, all?.x ?? seen.x),
      y1 = Math.min(seen.y, all?.y ?? seen.y);
    const x2 = Math.max(seen.x + seen.w, all ? all.x + all.w : 0),
      y2 = Math.max(seen.y + seen.h, all ? all.y + all.h : 0);
    const scale = Math.min(m.width / (x2 - x1 || 1), m.height / (y2 - y1 || 1));
    m.dataset['x'] = String(x1);
    m.dataset['y'] = String(y1);
    m.dataset['scale'] = String(scale);
    c.clearRect(0, 0, m.width, m.height);
    c.fillStyle = 'rgb(127 127 127 / 0.55)';
    for (const item of items.current) {
      const b = boundsOf(item);
      c.fillRect(
        (b.x - x1) * scale,
        (b.y - y1) * scale,
        Math.max(1.5, b.w * scale),
        Math.max(1.5, b.h * scale),
      );
    }
    c.strokeStyle = accent;
    c.lineWidth = 1.5;
    c.strokeRect((seen.x - x1) * scale, (seen.y - y1) * scale, seen.w * scale, seen.h * scale);
  }

  // ---- Changing the board ----
  const save = useCallback(() => {
    if (saveTimer.current !== null) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      const text = serialiseBoard({ version: 1, items: items.current });
      if (text === lastText.current) return;
      lastText.current = text;
      ctx.vault.writeText(path, text).catch((err: unknown) => {
        setNotice(
          `This board could not be saved. ${err instanceof Error ? err.message : String(err)}`,
        );
      });
    }, SAVE_MS);
  }, [ctx, path]);

  /** Puts a change on the board: kept for undo, joins followed, saved. */
  const commit = useCallback(
    (next: BoardItem[], remember = true) => {
      if (remember) {
        undo.current.push(items.current);
        if (undo.current.length > MAX_UNDO) undo.current.shift();
        redo.current = [];
      }
      items.current = withJoinsFollowed(next);
      setHistory({ undo: undo.current.length, redo: redo.current.length });
      save();
      redraw();
    },
    [save, redraw],
  );

  const stepHistory = useCallback(
    (back: boolean) => {
      const from = back ? undo.current : redo.current;
      const to = back ? redo.current : undo.current;
      const next = from.pop();
      if (!next) return;
      to.push(items.current);
      items.current = next;
      setSelection([]);
      setHistory({ undo: undo.current.length, redo: redo.current.length });
      save();
      redraw();
    },
    [save, redraw],
  );

  const loadImage = useCallback(
    (file: string) => {
      if (images.current.has(file)) return;
      const url = ctx.vault.fileUrl(file);
      if (url === null) return;
      const image = new Image();
      image.onload = () => {
        images.current.set(file, image);
        redraw();
      };
      image.src = url;
    },
    [ctx, redraw],
  );

  // ---- Reading the board, and following changes made elsewhere ----
  useEffect(() => {
    let current = true;
    const read = async () => {
      const text = (await ctx.vault.exists(path)) ? await ctx.vault.readText(path) : '';
      if (!current || text === lastText.current) return;
      const board = text.trim() === '' ? emptyBoard() : parseBoard(text);
      if (board === null) {
        setStatus('unreadable');
        return;
      }
      lastText.current = text;
      const first = status === 'reading';
      items.current = board.items;
      for (const item of board.items) if (item.kind === 'image') loadImage(item.path);
      setStatus('ready');
      if (first) view.current = viewToFit(boundsOfAll(board.items), size.current.w, size.current.h);
      redraw();
    };
    void read().catch(() => {
      if (current) setStatus('unreadable');
    });
    const watch = ctx.vault.watch((change) => {
      // Not while a change of our own is waiting to be written.
      if (change.paths.includes(path) && saveTimer.current === null)
        void read().catch(() => undefined);
    });
    return () => {
      current = false;
      watch.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, path, loadImage, redraw]);

  // Writes anything waiting when the board is left.
  useEffect(
    () => () => {
      if (saveTimer.current === null) return;
      clearTimeout(saveTimer.current);
      const text = serialiseBoard({ version: 1, items: items.current });
      if (text !== lastText.current) void ctx.vault.writeText(path, text).catch(() => undefined);
    },
    [ctx, path],
  );

  useEffect(() => {
    void ctx.storage
      .read('pens.json')
      .then((raw) => {
        setSaved(parseSavedPens(raw));
      })
      .catch(() => undefined);
  }, [ctx]);

  const keepPens = (pens: SavedPen[]) => {
    setSaved(pens);
    void ctx.storage.write('pens.json', pens).catch(() => undefined);
  };

  // ---- Size ----
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const fitCanvases = () => {
      const box = el.getBoundingClientRect();
      const first = size.current.w === 1;
      size.current = { w: Math.max(1, box.width), h: Math.max(1, box.height) };
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      for (const c of [base.current, top.current]) {
        if (!c) continue;
        c.width = Math.round(size.current.w * ratio);
        c.height = Math.round(size.current.h * ratio);
      }
      if (first)
        view.current = viewToFit(boundsOfAll(items.current), size.current.w, size.current.h);
      redraw();
    };
    fitCanvases();
    const observer = new ResizeObserver(fitCanvases);
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, [redraw]);

  useEffect(() => {
    redraw();
  }, [selection, editing, redraw]);

  // ---- View ----
  const zoomAt = useCallback(
    (factor: number, sx: number, sy: number) => {
      const v = view.current;
      const next = Math.max(0.05, Math.min(8, v.zoom * factor));
      const [bx, by] = toBoard(v, sx, sy);
      view.current = { x: bx - sx / next, y: by - sy / next, zoom: next };
      redraw();
    },
    [redraw],
  );
  const fit = () => {
    view.current = viewToFit(boundsOfAll(items.current), size.current.w, size.current.h);
    redraw();
  };

  // ---- Pointer ----
  useEffect(() => {
    const el = top.current;
    if (!el) return;
    const pointers = new Map<number, { x: number; y: number; type: string }>();
    let pinch = 0;
    let drag:
      | { kind: 'pan'; x: number; y: number }
      | { kind: 'draw'; id: number; lastMove: number; still: [number, number] }
      | { kind: 'erase'; before: BoardItem[]; changed: boolean }
      | { kind: 'shape'; x: number; y: number; from?: string }
      | { kind: 'lasso' }
      | { kind: 'move'; x: number; y: number; before: BoardItem[]; changed: boolean }
      | { kind: 'resize'; from: Box; corner: number; before: BoardItem[] }
      | null = null;
    let space = false;

    const at = (e: PointerEvent | MouseEvent | WheelEvent) => {
      const box = el.getBoundingClientRect();
      return { x: e.clientX - box.left, y: e.clientY - box.top };
    };
    const board = (p: { x: number; y: number }) => toBoard(view.current, p.x, p.y);
    const slop = () => 6 / view.current.zoom;
    /** Something an arrow can join to at a point: not ink. */
    const joinable = (x: number, y: number) =>
      [...items.current].reverse().find(
        (i) =>
          i.kind !== 'stroke' &&
          !(i.kind === 'shape' && (i.shape === 'line' || i.shape === 'arrow')) &&
          (() => {
            const b = boundsOf(i);
            return x >= b.x && y >= b.y && x <= b.x + b.w && y <= b.y + b.h;
          })(),
      );

    function corner(p: { x: number; y: number }): number {
      const box = selectionBox();
      if (!box) return -1;
      const v = view.current;
      const [x, y] = toScreen(v, box.x, box.y);
      const w = box.w * v.zoom,
        h = box.h * v.zoom;
      const corners = [
        [x - 4, y - 4],
        [x + w + 4, y - 4],
        [x - 4, y + h + 4],
        [x + w + 4, y + h + 4],
      ];
      return corners.findIndex(
        ([cx = 0, cy = 0]) => Math.abs(p.x - cx) <= HANDLE && Math.abs(p.y - cy) <= HANDLE,
      );
    }

    function eraseAt(x: number, y: number) {
      if (drag?.kind !== 'erase') return;
      const kept = items.current.filter((i) => !hits(i, x, y, slop() + 4));
      if (kept.length !== items.current.length) {
        items.current = kept;
        drag.changed = true;
        redraw();
      }
    }

    function down(e: PointerEvent) {
      if (now.current.editing !== null) return;
      el?.focus();
      const p = at(e);
      if (e.pointerType === 'pen') penSeen.current = true;
      // A palm resting while the pen writes is left alone.
      if (e.pointerType === 'touch' && drag?.kind === 'draw') return;
      pointers.set(e.pointerId, { ...p, type: e.pointerType });
      el?.setPointerCapture(e.pointerId);
      const touches = [...pointers.values()].filter((t) => t.type === 'touch');
      if (touches.length >= 2) {
        // Two fingers move and zoom the board, whatever tool is chosen.
        live.current = {};
        drag = { kind: 'pan', x: p.x, y: p.y };
        pinch = 0;
        return;
      }
      const t = now.current.tool;
      const panning =
        t === 'hand' ||
        e.button === 1 ||
        space ||
        (e.pointerType === 'touch' && penSeen.current && t !== 'select');
      if (panning) {
        drag = { kind: 'pan', x: p.x, y: p.y };
        return;
      }
      const [x, y] = board(p);
      if (isPen(t)) {
        const style = now.current.styles[t];
        live.current = {
          stroke: {
            id: newId(),
            kind: 'stroke',
            pen: t,
            colour: style.colour,
            width: style.width,
            points: [[x, y, e.pointerType === 'pen' ? e.pressure || 0.5 : 0.5]],
          },
        };
        drag = { kind: 'draw', id: e.pointerId, lastMove: e.timeStamp, still: [p.x, p.y] };
        setSelection([]);
      } else if (t === 'eraser') {
        drag = { kind: 'erase', before: items.current, changed: false };
        eraseAt(x, y);
      } else if (t === 'shape') {
        const s = now.current.shape;
        const linear = s === 'line' || s === 'arrow';
        const from = linear ? joinable(x, y)?.id : undefined;
        drag = from === undefined ? { kind: 'shape', x, y } : { kind: 'shape', x, y, from };
      } else if (t === 'text' || t === 'note') {
        const id = newId();
        const item: BoardItem =
          t === 'text'
            ? {
                id,
                kind: 'text',
                x,
                y,
                w: 260 / Math.min(1, view.current.zoom),
                text: '',
                colour: now.current.shapeStyle.colour,
                size: 18 / Math.min(1, view.current.zoom),
              }
            : {
                id,
                kind: 'note',
                x: x - 90,
                y: y - 70,
                w: 180,
                h: 140,
                text: '',
                colour: NOTE_COLOURS[items.current.length % NOTE_COLOURS.length] ?? '#ffe58a',
              };
        commit([...items.current, item]);
        setTool('select');
        setSelection([id]);
        // After this press has finished, or the board would take the focus back.
        setTimeout(() => {
          setEditing(id);
        }, 0);
      } else {
        const handle = corner(p);
        const box = selectionBox();
        if (handle >= 0 && box) {
          drag = { kind: 'resize', from: box, corner: handle, before: items.current };
          return;
        }
        const hit = itemAt(items.current, x, y, slop());
        const inBox =
          box !== null && x >= box.x && y >= box.y && x <= box.x + box.w && y <= box.y + box.h;
        if (hit || inBox) {
          if (hit && !now.current.selection.includes(hit.id) && !inBox) {
            now.current.selection = [hit.id];
            setSelection([hit.id]);
          }
          drag = { kind: 'move', x, y, before: items.current, changed: false };
        } else {
          setSelection([]);
          live.current = { lasso: [[x, y]] };
          drag = { kind: 'lasso' };
        }
      }
    }

    function move(e: PointerEvent) {
      const p = at(e);
      const known = pointers.get(e.pointerId);
      if (!known || drag === null) return;
      const touches = [...pointers.entries()].filter(([, t]) => t.type === 'touch');
      if (touches.length >= 2 && known.type === 'touch') {
        const before = touches.map(([, t]) => ({ ...t }));
        pointers.set(e.pointerId, { ...p, type: known.type });
        const after = [...pointers.values()].filter((t) => t.type === 'touch');
        const [a, b] = after;
        const [a0, b0] = before;
        if (!a || !b || !a0 || !b0) return;
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const mid0 = { x: (a0.x + b0.x) / 2, y: (a0.y + b0.y) / 2 };
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        view.current = {
          ...view.current,
          x: view.current.x - (mid.x - mid0.x) / view.current.zoom,
          y: view.current.y - (mid.y - mid0.y) / view.current.zoom,
        };
        if (pinch > 0 && distance > 0) zoomAt(distance / pinch, mid.x, mid.y);
        pinch = distance;
        redraw();
        return;
      }
      pointers.set(e.pointerId, { ...p, type: known.type });
      const [x, y] = board(p);
      switch (drag.kind) {
        case 'pan':
          view.current = {
            ...view.current,
            x: view.current.x - (p.x - drag.x) / view.current.zoom,
            y: view.current.y - (p.y - drag.y) / view.current.zoom,
          };
          drag.x = p.x;
          drag.y = p.y;
          break;
        case 'draw': {
          if (e.pointerId !== drag.id) return;
          const stroke = live.current.stroke;
          if (!stroke) return;
          const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
          for (const ev of events.length > 0 ? events : [e]) {
            const q = board(at(ev));
            stroke.points.push([q[0], q[1], ev.pointerType === 'pen' ? ev.pressure || 0.5 : 0.5]);
          }
          if (Math.hypot(p.x - drag.still[0], p.y - drag.still[1]) > 3) {
            drag.lastMove = e.timeStamp;
            drag.still = [p.x, p.y];
          }
          break;
        }
        case 'erase':
          eraseAt(x, y);
          break;
        case 'shape': {
          const s = now.current.shape;
          const style = now.current.shapeStyle;
          live.current = {
            shape: {
              id: 'live',
              kind: 'shape',
              shape: s,
              x1: drag.x,
              y1: drag.y,
              x2: x,
              y2: y,
              colour: style.colour,
              width: style.width,
              fill: null,
            },
          };
          break;
        }
        case 'lasso':
          live.current.lasso?.push([x, y]);
          break;
        case 'move': {
          const ids = now.current.selection;
          const dx = x - drag.x,
            dy = y - drag.y;
          if (!drag.changed && Math.hypot(dx, dy) * view.current.zoom < 3) return;
          drag.changed = true;
          items.current = withJoinsFollowed(
            drag.before.map((i) => (ids.includes(i.id) ? moved(i, dx, dy) : i)),
          );
          break;
        }
        case 'resize': {
          const f = drag.from;
          const left = drag.corner % 2 === 0,
            up = drag.corner < 2;
          const ax = left ? f.x + f.w : f.x,
            ay = up ? f.y + f.h : f.y;
          const to: Box = {
            x: Math.min(ax, x),
            y: Math.min(ay, y),
            w: Math.max(4, Math.abs(x - ax)),
            h: Math.max(4, Math.abs(y - ay)),
          };
          const ids = now.current.selection;
          items.current = withJoinsFollowed(
            drag.before.map((i) => (ids.includes(i.id) ? resized(i, f, to) : i)),
          );
          break;
        }
      }
      redraw();
    }

    function up(e: PointerEvent) {
      const known = pointers.get(e.pointerId);
      pointers.delete(e.pointerId);
      pinch = 0;
      if (!known || drag === null) return;
      const d = drag;
      if (d.kind === 'draw' && e.pointerId !== d.id) return;
      drag = null;
      const p = at(e);
      const [x, y] = board(p);
      if (d.kind === 'draw') {
        const stroke = live.current.stroke;
        live.current = {};
        if (!stroke) return;
        const v = view.current;
        const screen = stroke.points.map(([px, py, pr]): [number, number, number, number] => [
          (px - v.x) * v.zoom,
          (py - v.y) * v.zoom,
          pr,
          0,
        ]);
        const held =
          e.type === 'pointerup' && e.timeStamp - d.lastMove >= HOLD_MS && stroke.points.length > 3;
        // A scribble over things rubs them out, and goes too.
        if (!held && isScribble(screen)) {
          const b = boundsOf(stroke);
          const inside = (px: number, py: number) =>
            px >= b.x && py >= b.y && px <= b.x + b.w && py <= b.y + b.h;
          const under = items.current.filter((i) => {
            if (i.kind === 'stroke') {
              return i.points.filter(([px, py]) => inside(px, py)).length >= i.points.length * 0.5;
            }
            const ib = boundsOf(i);
            return inside(ib.x + ib.w / 2, ib.y + ib.h / 2);
          });
          if (under.length > 0) {
            commit(items.current.filter((i) => !under.includes(i)));
            return;
          }
        }
        const neat = held ? tidied(stroke) : null;
        commit([...items.current, neat ?? stroke]);
      } else if (d.kind === 'erase') {
        if (d.changed) {
          const after = items.current;
          items.current = d.before;
          commit(after);
        }
      } else if (d.kind === 'shape') {
        live.current = {};
        if (Math.hypot(x - d.x, y - d.y) * view.current.zoom < 5) {
          redraw();
          return;
        }
        const s = now.current.shape;
        const style = now.current.shapeStyle;
        const linear = s === 'line' || s === 'arrow';
        const to = linear ? joinable(x, y)?.id : undefined;
        const item: BoardItem = {
          id: newId(),
          kind: 'shape',
          shape: s,
          x1: d.x,
          y1: d.y,
          x2: x,
          y2: y,
          colour: style.colour,
          width: style.width,
          fill: null,
          ...(d.from !== undefined && d.from !== to ? { from: d.from } : {}),
          ...(to !== undefined && to !== d.from ? { to } : {}),
        };
        commit([...items.current, item]);
      } else if (d.kind === 'lasso') {
        const loop = live.current.lasso ?? [];
        live.current = {};
        setSelection(loop.length > 3 ? lassoed(items.current, loop) : []);
        redraw();
      } else if (d.kind === 'move' || d.kind === 'resize') {
        if (d.kind === 'resize' || d.changed) {
          const after = items.current;
          items.current = d.before;
          commit(after);
        }
      }
    }

    function wheel(e: WheelEvent) {
      e.preventDefault();
      const p = at(e);
      zoomAt(Math.exp(-e.deltaY * 0.0015), p.x, p.y);
    }

    function double(e: MouseEvent) {
      const [x, y] = board(at(e));
      const hit = itemAt(items.current, x, y, slop());
      if (hit && (hit.kind === 'text' || hit.kind === 'note')) {
        setTool('select');
        setSelection([hit.id]);
        setEditing(hit.id);
      }
    }

    function key(e: KeyboardEvent) {
      if (now.current.editing !== null) return;
      const ids = now.current.selection;
      const chosen = items.current.filter((i) => ids.includes(i.id));
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (e.key === ' ') space = true;
      else if (mod && k === 'z') stepHistory(!e.shiftKey);
      else if (mod && k === 'y') stepHistory(false);
      else if (mod && k === 'a') setSelection(items.current.map((i) => i.id));
      else if (mod && k === 'c' && chosen.length > 0) clipboard.current = chosen;
      else if (mod && (k === 'v' || k === 'd')) {
        const source = k === 'd' ? chosen : clipboard.current;
        if (source.length === 0) return;
        const copies = duplicated(source, 24, 24);
        commit([...items.current, ...copies]);
        setSelection(copies.map((i) => i.id));
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && chosen.length > 0) {
        commit(items.current.filter((i) => !ids.includes(i.id)));
        setSelection([]);
      } else if (e.key === 'Escape') setSelection([]);
      else if (e.key.startsWith('Arrow') && chosen.length > 0) {
        const step = (e.shiftKey ? 10 : 1) / view.current.zoom;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        commit(items.current.map((i) => (ids.includes(i.id) ? moved(i, dx, dy) : i)));
      } else return;
      e.preventDefault();
    }
    const keyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') space = false;
    };

    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', wheel, { passive: false });
    el.addEventListener('dblclick', double);
    el.addEventListener('keydown', key);
    el.addEventListener('keyup', keyUp);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('wheel', wheel);
      el.removeEventListener('dblclick', double);
      el.removeEventListener('keydown', key);
      el.removeEventListener('keyup', keyUp);
    };
  }, [commit, redraw, stepHistory, zoomAt]);

  // ---- Images and PDF pages ----
  const place = useCallback(
    async (files: readonly File[], where?: [number, number]) => {
      const folder = `${dirOf(path)}${dirOf(path) === '' ? '' : '/'}attachments`;
      const added: BoardItem[] = [];
      const [cx, cy] = where ?? toBoard(view.current, size.current.w / 2, size.current.h / 2);
      let offset = 0;
      const put = async (bytes: Uint8Array, name: string, ext: string, w: number, h: number) => {
        await ctx.vault.ensureDir(folder);
        const file = await ctx.vault.freeName(
          folder,
          name.replace(/[\\/:*?"<>|#^[\]]+/g, '-'),
          ext,
        );
        const target = `${folder}/${file}`;
        await ctx.vault.writeBytes(target, bytes);
        const scale = Math.min(1, MAX_IMAGE / Math.max(w, 1));
        added.push({
          id: newId(),
          kind: 'image',
          x: cx - (w * scale) / 2,
          y: cy + offset,
          w: w * scale,
          h: h * scale,
          path: target,
        });
        offset += h * scale + 16;
        loadImage(target);
      };
      try {
        for (const file of files) {
          const bytes = new Uint8Array(await file.arrayBuffer());
          const stem = file.name.replace(/\.[^.]+$/, '') || 'image';
          if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
            const pdf = await ctx.files.openPdf(bytes);
            try {
              for (let n = 1; n <= Math.min(pdf.pages, PDF_PAGES); n += 1) {
                const page = await pdf.size(n);
                const canvas = document.createElement('canvas');
                const width = 900;
                await pdf.render(n, canvas, width).done;
                const blob = await new Promise<Blob | null>((resolve) => {
                  canvas.toBlob(resolve, 'image/png');
                });
                if (!blob) continue;
                await put(
                  new Uint8Array(await blob.arrayBuffer()),
                  `${stem} page ${String(n)}`,
                  '.png',
                  width,
                  (width * page.height) / page.width,
                );
              }
              if (pdf.pages > PDF_PAGES)
                setNotice(`The first ${String(PDF_PAGES)} pages were added.`);
            } finally {
              pdf.destroy();
            }
          } else if (file.type.startsWith('image/')) {
            const url = URL.createObjectURL(file);
            const dims = await new Promise<{ w: number; h: number }>((resolve) => {
              const image = new Image();
              image.onload = () => {
                resolve({ w: image.naturalWidth, h: image.naturalHeight });
              };
              image.onerror = () => {
                resolve({ w: 400, h: 300 });
              };
              image.src = url;
            });
            URL.revokeObjectURL(url);
            const ext = /\.[a-z0-9]+$/i.exec(file.name)?.[0].toLowerCase() ?? '.png';
            await put(bytes, stem, ext, dims.w, dims.h);
          }
        }
      } catch (err) {
        setNotice(`That could not be added. ${err instanceof Error ? err.message : String(err)}`);
      }
      if (added.length > 0) {
        commit([...items.current, ...added]);
        setTool('select');
        setSelection(added.map((i) => i.id));
      }
    },
    [ctx, path, commit, loadImage],
  );

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const paste = (e: ClipboardEvent) => {
      if (now.current.editing !== null) return;
      const files = [...(e.clipboardData?.files ?? [])];
      if (files.length === 0) return;
      e.preventDefault();
      void place(files);
    };
    const over = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      const files = [...(e.dataTransfer?.files ?? [])];
      if (files.length === 0) return;
      e.preventDefault();
      const box = el.getBoundingClientRect();
      void place(files, toBoard(view.current, e.clientX - box.left, e.clientY - box.top));
    };
    el.addEventListener('paste', paste);
    el.addEventListener('dragover', over);
    el.addEventListener('drop', drop);
    return () => {
      el.removeEventListener('paste', paste);
      el.removeEventListener('dragover', over);
      el.removeEventListener('drop', drop);
    };
  }, [place]);

  // ---- What the toolbar and the selection's buttons do ----
  const chosen = items.current.filter((i) => selection.includes(i.id));
  const box = boundsOfAll(chosen);
  const active: PenStyle | null = isPen(tool)
    ? styles[tool]
    : tool === 'shape' || tool === 'text'
      ? shapeStyle
      : null;
  const setActive = (change: Partial<PenStyle>) => {
    if (isPen(tool)) setStyles({ ...styles, [tool]: { ...styles[tool], ...change } });
    else setShapeStyle({ ...shapeStyle, ...change });
  };
  const recolour = (colour: string) => {
    commit(
      items.current.map((i) =>
        selection.includes(i.id) && i.kind !== 'image' ? { ...i, colour } : i,
      ),
    );
  };
  const restack = (front: boolean) => {
    const rest = items.current.filter((i) => !selection.includes(i.id));
    commit(front ? [...rest, ...chosen] : [...chosen, ...rest]);
  };
  const edited = items.current.find((i) => i.id === editing);
  const v = view.current;

  const finishEditing = (text: string) => {
    const id = editing;
    setEditing(null);
    if (id === null) return;
    const item = items.current.find((i) => i.id === id);
    if (!item || (item.kind !== 'text' && item.kind !== 'note')) return;
    if (text.trim() === '' && item.kind === 'text') {
      commit(items.current.filter((i) => i.id !== id));
      setSelection([]);
    } else if (text !== item.text) {
      commit(items.current.map((i) => (i.id === id ? { ...item, text } : i)));
    }
    top.current?.focus();
  };

  const toolButton = (t: Tool, label: string, Icon: LucideIcon) => (
    <button
      key={t}
      type="button"
      className="tool"
      title={label}
      aria-label={label}
      aria-pressed={tool === t}
      onClick={() => {
        setTool(t);
      }}
    >
      <Icon {...ICON} />
    </button>
  );

  if (status === 'unreadable') {
    return <p className="notice">This board could not be read, so it is left as it is.</p>;
  }
  return (
    <div className="wb">
      <div className="wb-toolbar" role="toolbar" aria-label="Whiteboard tools">
        <div className="tool-group" role="group" aria-label="Move and choose">
          {toolButton('select', 'Select: lasso, move and resize', LassoSelect)}
          {toolButton('hand', 'Move the board', Hand)}
        </div>
        <div className="tool-group" role="group" aria-label="Pens">
          {PENS.map((p) => toolButton(p.pen, p.label, p.icon))}
          {toolButton('eraser', 'Eraser', Eraser)}
        </div>
        <div className="tool-group" role="group" aria-label="Shapes and text">
          {SHAPES.map((s) => (
            <button
              key={s.shape}
              type="button"
              className="tool"
              title={s.label}
              aria-label={s.label}
              aria-pressed={tool === 'shape' && shape === s.shape}
              onClick={() => {
                setShape(s.shape);
                setTool('shape');
              }}
            >
              <s.icon {...ICON} />
            </button>
          ))}
          {toolButton('text', 'Text', Type)}
          {toolButton('note', 'Sticky note', StickyNote)}
          <button
            type="button"
            className="tool"
            title="Add images or a PDF"
            aria-label="Add images or a PDF"
            onClick={() => fileInput.current?.click()}
          >
            <ImagePlus {...ICON} />
          </button>
          <input
            ref={fileInput}
            type="file"
            hidden
            multiple
            accept="image/*,application/pdf"
            aria-label="Images or a PDF to add"
            onChange={(e) => {
              const files = [...(e.target.files ?? [])];
              e.target.value = '';
              void place(files);
            }}
          />
        </div>
        {active !== null && (
          <div className="tool-group wb-style" role="group" aria-label="Colour and thickness">
            {COLOURS.map((c) => (
              <button
                key={c.value}
                type="button"
                className="colour-chip ink"
                title={c.name}
                aria-label={c.name}
                aria-pressed={active.colour === c.value}
                style={{ background: c.value }}
                onClick={() => {
                  setActive({ colour: c.value });
                }}
              />
            ))}
            <label className="pen-custom" title="Any colour">
              <span className="visually-hidden">Any colour</span>
              <input
                type="color"
                value={active.colour}
                onChange={(e) => {
                  setActive({ colour: e.target.value });
                }}
              />
            </label>
            {tool !== 'text' && (
              <>
                <input
                  type="range"
                  className="pen-slider"
                  aria-label="Thickness"
                  min={0.5}
                  max={tool === 'highlighter' || tool === 'marker' ? 40 : 14}
                  step={0.5}
                  value={active.width}
                  onChange={(e) => {
                    setActive({ width: Number(e.target.value) });
                  }}
                />
                <span className="pen-size">{String(active.width)}</span>
              </>
            )}
            {isPen(tool) && (
              <button
                type="button"
                className="tool"
                title="Keep this pen as a favourite"
                aria-label="Keep this pen as a favourite"
                disabled={saved.some(
                  (p) => p.pen === tool && p.colour === active.colour && p.width === active.width,
                )}
                onClick={() => {
                  keepPens([...saved, { pen: tool, ...active }].slice(-10));
                }}
              >
                <Star {...ICON} />
              </button>
            )}
          </div>
        )}
        {saved.length > 0 && (
          <div className="tool-group" role="group" aria-label="Favourite pens">
            {saved.map((p, i) => (
              <span key={`${p.pen}${p.colour}${String(p.width)}`} className="wb-favourite">
                <button
                  type="button"
                  className="tool pen-favourite"
                  title={`${PENS.find((k) => k.pen === p.pen)?.label ?? 'Pen'} ${String(i + 1)}`}
                  aria-label={`${PENS.find((k) => k.pen === p.pen)?.label ?? 'Pen'} ${String(i + 1)}`}
                  aria-pressed={
                    tool === p.pen &&
                    styles[p.pen].colour === p.colour &&
                    styles[p.pen].width === p.width
                  }
                  onClick={() => {
                    setStyles({ ...styles, [p.pen]: { colour: p.colour, width: p.width } });
                    setTool(p.pen);
                  }}
                >
                  <span
                    className="pen-dot"
                    aria-hidden="true"
                    style={{
                      width: Math.max(5, Math.min(18, p.width * 1.6)),
                      height: Math.max(5, Math.min(18, p.width * 1.6)),
                      background: p.colour,
                      opacity: p.pen === 'highlighter' ? 0.55 : 1,
                    }}
                  />
                </button>
                <button
                  type="button"
                  className="wb-unfavourite"
                  aria-label={`Remove favourite ${String(i + 1)}`}
                  title="Remove"
                  onClick={() => {
                    keepPens(saved.filter((_p, j) => j !== i));
                  }}
                >
                  <X size={10} aria-hidden />
                </button>
              </span>
            ))}
          </div>
        )}
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
      <div className={`wb-stage tool-${tool}`} ref={stage}>
        <canvas ref={base} className="wb-canvas" aria-hidden="true" />
        <canvas
          ref={top}
          className="wb-canvas wb-top"
          tabIndex={0}
          role="img"
          aria-label="Whiteboard. Draw with the pen, a finger or the mouse. Two fingers, or the wheel, move and zoom."
        />
        {status === 'reading' && <p className="hint wb-reading">Opening the board…</p>}
        {edited && (edited.kind === 'text' || edited.kind === 'note') && (
          <textarea
            className={edited.kind === 'note' ? 'wb-edit note' : 'wb-edit'}
            aria-label={edited.kind === 'note' ? 'Sticky note' : 'Text'}
            autoFocus
            defaultValue={edited.text}
            style={{
              left: (edited.x - v.x) * v.zoom + (edited.kind === 'note' ? 10 * v.zoom : 0),
              top: (edited.y - v.y) * v.zoom + (edited.kind === 'note' ? 10 * v.zoom : 0),
              width: (edited.kind === 'note' ? edited.w - 20 : edited.w) * v.zoom,
              height: edited.kind === 'note' ? (edited.h - 20) * v.zoom : undefined,
              fontSize: (edited.kind === 'note' ? 15 : edited.size) * v.zoom,
              color: edited.kind === 'note' ? '#1d2725' : undefined,
            }}
            onBlur={(e) => {
              finishEditing(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') e.currentTarget.blur();
            }}
          />
        )}
        {box !== null && editing === null && (
          <div
            className="wb-actions"
            role="toolbar"
            aria-label="Selection"
            style={{
              left: Math.max(8, Math.min(size.current.w - 300, (box.x - v.x) * v.zoom)),
              top: Math.max(8, (box.y - v.y) * v.zoom - 52),
            }}
          >
            {COLOURS.slice(0, 6).map((c) => (
              <button
                key={c.value}
                type="button"
                className="colour-chip ink"
                title={c.name}
                aria-label={`Make it ${c.name.toLowerCase()}`}
                style={{ background: c.value }}
                onClick={() => {
                  recolour(c.value);
                }}
              />
            ))}
            <button
              type="button"
              className="tool"
              title="Copy"
              aria-label="Copy"
              onClick={() => {
                const copies = duplicated(chosen, 24, 24);
                commit([...items.current, ...copies]);
                setSelection(copies.map((i) => i.id));
              }}
            >
              <Copy {...ICON} />
            </button>
            <button
              type="button"
              className="tool"
              title="Bring to the front"
              aria-label="Bring to the front"
              onClick={() => {
                restack(true);
              }}
            >
              <BringToFront {...ICON} />
            </button>
            <button
              type="button"
              className="tool"
              title="Send to the back"
              aria-label="Send to the back"
              onClick={() => {
                restack(false);
              }}
            >
              <SendToBack {...ICON} />
            </button>
            <button
              type="button"
              className="tool"
              title="Delete"
              aria-label="Delete"
              onClick={() => {
                commit(items.current.filter((i) => !selection.includes(i.id)));
                setSelection([]);
              }}
            >
              <Trash2 {...ICON} />
            </button>
          </div>
        )}
        <canvas
          ref={map}
          className="wb-map"
          width={160}
          height={110}
          role="img"
          aria-label="Map of the board. Press to go there."
          onPointerDown={(e) => {
            const m = e.currentTarget;
            const r = m.getBoundingClientRect();
            const scale = Number(m.dataset['scale'] ?? 1) || 1;
            const bx =
              Number(m.dataset['x'] ?? 0) + ((e.clientX - r.left) * (m.width / r.width)) / scale;
            const by =
              Number(m.dataset['y'] ?? 0) + ((e.clientY - r.top) * (m.height / r.height)) / scale;
            view.current = {
              ...view.current,
              x: bx - size.current.w / view.current.zoom / 2,
              y: by - size.current.h / view.current.zoom / 2,
            };
            redraw();
          }}
        />
        <div className="wb-zoom" role="group" aria-label="Zoom">
          <button
            type="button"
            className="tool"
            title="Zoom out"
            aria-label="Zoom out"
            onClick={() => {
              zoomAt(1 / 1.25, size.current.w / 2, size.current.h / 2);
            }}
          >
            <Minus {...ICON} />
          </button>
          <span aria-live="polite">{String(Math.round(zoom * 100))}%</span>
          <button
            type="button"
            className="tool"
            title="Zoom in"
            aria-label="Zoom in"
            onClick={() => {
              zoomAt(1.25, size.current.w / 2, size.current.h / 2);
            }}
          >
            <Plus {...ICON} />
          </button>
          <button
            type="button"
            className="tool"
            title="Show the whole board"
            aria-label="Show the whole board"
            onClick={fit}
          >
            <Maximize {...ICON} />
          </button>
        </div>
      </div>
    </div>
  );
}
