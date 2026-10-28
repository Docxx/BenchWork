import type { InkStroke, InkTool } from './inkFile';
import { decide, DEFAULT_RULES, type PalmRules, type PalmState } from './palm';
import {
  StrokeRecorder,
  strokeHits,
  strokeOutline,
  strokePressure,
  TOOL_STYLE,
  type RawPoint,
} from './stroke';

/**
 * Where ink is written: two canvases stacked over an area of the page.
 * Finished strokes are drawn once on the lower one; the stroke being
 * written is drawn alone on the upper one each frame, so writing costs the
 * same however full the page is (measured in the ink spike).
 *
 * Pens and mice write; fingers scroll the page, and a palm resting while
 * writing is ignored. The pen's eraser end, or the eraser tool, removes
 * whole strokes it touches.
 */

/** The pen, highlighter or eraser, or a tool from a module, by its id. */
export type PenTool = InkTool | 'eraser' | (string & {});

/** A point on the drawing, in CSS pixels from its top left. */
export interface ToolPoint {
  x: number;
  y: number;
}

/** A drawing, as a module's tool sees it. Matches InkToolArea in the module API. */
export interface ToolArea {
  strokes(): readonly InkStroke[];
  setStrokes(strokes: readonly InkStroke[]): void;
  previewStrokes(strokes: readonly InkStroke[]): void;
  readonly overlay: CanvasRenderingContext2D;
  clearOverlay(): void;
  readonly element: HTMLElement;
}

/** A module's tool, such as a lasso. Matches InkToolSpec in the module API. */
export interface SurfaceTool {
  down(area: ToolArea, point: ToolPoint): void;
  move(area: ToolArea, point: ToolPoint): void;
  up(area: ToolArea, point: ToolPoint): void;
  end?(area: ToolArea): void;
}

/** What a filter knows about a stroke as it is finished. */
export interface FilterInfo {
  /** The pen stayed still for a moment before it lifted. */
  held: boolean;
  /** The drawing's other strokes. */
  others: readonly InkStroke[];
  /** Removes other strokes from the drawing, such as those scribbled over. */
  erase: (ids: readonly string[]) => void;
}

/** Changes a stroke as it is finished. Matches StrokeFilterSpec in the module API. */
export interface SurfaceFilter {
  /** The stroke to keep, with the same id, or null to keep none. */
  filter(stroke: InkStroke, info: FilterInfo): InkStroke | null;
}

export interface PenSettings {
  tool: PenTool;
  /** A colour such as `#1d2725`. */
  colour: string;
  /** Base width in CSS pixels. */
  width: number;
}

export interface SurfaceHooks {
  /** The tool, colour and width to write with now. */
  settings: () => PenSettings;
  /** The strokes after a stroke is finished or strokes are erased. */
  onChange: (strokes: InkStroke[]) => void;
  /** Called whenever a pen is seen, hovering or writing. */
  onPen?: () => void;
  /** Whether the page is dark, so near-black ink shows light. */
  dark?: () => boolean;
  /** Changes to strokes as they are finished, from modules. */
  filters?: () => readonly SurfaceFilter[];
  /** A module's tool by its id, or null. */
  tool?: (id: string) => SurfaceTool | null;
}

/** How long the pen stays still before lifting for a stroke to count as held, in ms. */
export const HOLD_MS = 450;
/** Movement smaller than this, in CSS pixels, is the pen staying still. */
const STILL_PX = 3;

/** How far from the eraser's tip a stroke is touched, in CSS pixels. */
const ERASER_RADIUS = 6;

/** Relative luminance of a `#rrggbb` colour, 0 (black) to 1 (white). */
function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  const c = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * c((n >> 16) & 255) + 0.7152 * c((n >> 8) & 255) + 0.0722 * c(n & 255);
}

/**
 * The colour ink shows in: as written, except that very dark ink shows
 * light on a dark page and very light ink shows dark on a light one. The
 * file keeps the colour as written.
 */
export function shownColour(colour: string, dark: boolean): string {
  const l = luminance(colour);
  if (dark && l < 0.03) return '#e6e8e7';
  if (!dark && l > 0.85) return '#1d2725';
  return colour;
}

export function drawStroke(
  ctx: CanvasRenderingContext2D,
  stroke: InkStroke,
  dark: boolean,
  complete = true,
): void {
  const outline = strokeOutline(stroke, complete);
  const start = outline[0];
  if (!start || start[0] === undefined || start[1] === undefined) return;
  ctx.globalAlpha = TOOL_STYLE[stroke.tool].alpha;
  ctx.fillStyle = shownColour(stroke.colour, dark);
  ctx.beginPath();
  ctx.moveTo(start[0], start[1]);
  for (const [x = 0, y = 0] of outline) ctx.lineTo(x, y);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
}

/** The pen's eraser end, or its barrel button held as one. */
function isEraserEnd(e: PointerEvent): boolean {
  return e.pointerType === 'pen' && (e.button === 5 || (e.buttons & 32) !== 0);
}

function context(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser has no 2D canvas');
  return ctx;
}

/** Pointer capture fails for synthetic events in tests; writing works without it. */
function capture(el: HTMLElement, id: number): void {
  try {
    el.setPointerCapture(id);
  } catch {
    // Not a live pointer.
  }
}

export class InkSurface {
  private readonly base: HTMLCanvasElement;
  private readonly live: HTMLCanvasElement;
  private readonly baseCtx: CanvasRenderingContext2D;
  private readonly liveCtx: CanvasRenderingContext2D;
  private strokes: InkStroke[];
  private readonly recorder = new StrokeRecorder();
  private readonly palm: PalmState = { lastPenAt: null };
  private active: {
    id: number;
    erasing: boolean;
    touch: boolean;
    tool: SurfaceTool | null;
  } | null = null;
  /** The module tool last used here, told when another is chosen. */
  private lastTool: SurfaceTool | null = null;
  /** Where and when the pen last moved, to tell a held stroke. */
  private lastMove: { x: number; y: number; time: number } | null = null;
  private readonly area: ToolArea;
  private scrolling: { id: number; lastX: number; lastY: number } | null = null;
  private erased = false;
  private editable = true;
  private frame: number | null = null;
  private dpr = 1;
  private readonly resize: ResizeObserver | null;
  private readonly cleanups: (() => void)[] = [];

  constructor(
    private readonly host: HTMLElement,
    strokes: readonly InkStroke[],
    private readonly hooks: SurfaceHooks,
    private readonly rules: PalmRules = DEFAULT_RULES,
  ) {
    this.strokes = [...strokes];
    this.base = document.createElement('canvas');
    this.live = document.createElement('canvas');
    this.base.className = 'ink-canvas';
    this.live.className = 'ink-canvas live';
    host.append(this.base, this.live);
    this.baseCtx = context(this.base);
    this.liveCtx = context(this.live);
    this.area = {
      strokes: () => this.strokes,
      setStrokes: (next) => {
        this.strokes = [...next];
        this.redraw();
        this.hooks.onChange([...this.strokes]);
      },
      previewStrokes: (next) => {
        this.drawAll(next);
      },
      overlay: this.liveCtx,
      clearOverlay: () => {
        this.clearLive();
        this.liveCtx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      },
      element: host,
    };
    this.listen(host, 'pointerdown', (e) => {
      this.onDown(e);
    });
    this.listen(host, 'pointermove', (e) => {
      this.onMove(e);
    });
    this.listen(host, 'pointerup', (e) => {
      this.onUp(e, false);
    });
    this.listen(host, 'pointercancel', (e) => {
      this.onUp(e, true);
    });
    // A pen hovering anywhere counts as the pen being near.
    this.listen(window, 'pointermove', (e) => {
      if (e.pointerType === 'pen') this.penSeen(e.timeStamp);
    });
    this.resize =
      typeof ResizeObserver === 'function'
        ? new ResizeObserver(() => {
            this.fit();
          })
        : null;
    this.resize?.observe(host);
    this.fit();
  }

  /** Shows strokes changed elsewhere, such as the file changing on disk. */
  setStrokes(strokes: readonly InkStroke[]): void {
    this.strokes = [...strokes];
    this.redraw();
  }

  /** Read-only ink cannot be written on, and fingers scroll as usual. */
  setEditable(editable: boolean): void {
    this.editable = editable;
    if (!editable) this.stop();
  }

  /** Draws every stroke again, for example after the theme changes. */
  redraw(): void {
    this.drawAll(this.strokes);
  }

  private drawAll(strokes: readonly InkStroke[]): void {
    const c = this.baseCtx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.base.width, this.base.height);
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const dark = this.hooks.dark?.() ?? false;
    for (const stroke of strokes) drawStroke(c, stroke, dark);
  }

  destroy(): void {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.lastTool?.end?.(this.area);
    this.resize?.disconnect();
    for (const cleanup of this.cleanups) cleanup();
    this.base.remove();
    this.live.remove();
  }

  private listen(
    target: HTMLElement | Window,
    type: string,
    handler: (e: PointerEvent) => void,
  ): void {
    const listener = (e: Event) => {
      handler(e as PointerEvent);
    };
    target.addEventListener(type, listener);
    this.cleanups.push(() => {
      target.removeEventListener(type, listener);
    });
  }

  /** Sizes both canvases to the ink area, sharp on high density screens. */
  private fit(): void {
    const { width, height } = this.host.getBoundingClientRect();
    this.dpr = window.devicePixelRatio || 1;
    for (const c of [this.base, this.live]) {
      c.width = Math.max(1, Math.round(width * this.dpr));
      c.height = Math.max(1, Math.round(height * this.dpr));
    }
    this.redraw();
  }

  private penSeen(time: number): void {
    this.palm.lastPenAt = time;
    this.hooks.onPen?.();
    // A palm usually lands just before the pen: drop the stroke it started.
    if (this.active?.touch) this.stop();
  }

  private point(e: PointerEvent): RawPoint {
    const rect = this.host.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      pressure: strokePressure(e.pointerType, e.pressure),
      time: e.timeStamp,
    };
  }

  private onDown(e: PointerEvent): void {
    if (e.pointerType === 'pen') this.penSeen(e.timeStamp);
    if (this.active) return;
    const decision = this.editable
      ? decide(
          { pointerType: e.pointerType, width: e.width, height: e.height, time: e.timeStamp },
          this.palm,
          this.rules,
        )
      : { action: 'scroll' as const };
    if (decision.action === 'ignore') return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (decision.action === 'scroll') {
      if (e.pointerType !== 'touch') return;
      capture(this.host, e.pointerId);
      this.scrolling = { id: e.pointerId, lastX: e.clientX, lastY: e.clientY };
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    capture(this.host, e.pointerId);
    const settings = this.hooks.settings();
    const erasing = settings.tool === 'eraser' || isEraserEnd(e);
    const builtIn = settings.tool === 'pen' || settings.tool === 'highlighter';
    const tool = erasing || builtIn ? null : (this.hooks.tool?.(settings.tool) ?? null);
    if (this.lastTool !== null && this.lastTool !== tool) {
      this.lastTool.end?.(this.area);
      this.lastTool = null;
    }
    this.active = { id: e.pointerId, erasing, touch: e.pointerType === 'touch', tool };
    if (tool !== null) {
      this.lastTool = tool;
      tool.down(this.area, this.point(e));
      return;
    }
    if (erasing) {
      this.erased = false;
      this.eraseAt(e);
      return;
    }
    const first = this.point(e);
    this.lastMove = { x: first.x, y: first.y, time: e.timeStamp };
    this.recorder.begin(
      settings.tool === 'highlighter' ? 'highlighter' : 'pen',
      settings.colour,
      settings.width,
      first,
    );
    this.requestFrame();
  }

  private onMove(e: PointerEvent): void {
    if (this.scrolling?.id === e.pointerId) {
      // Fingers scroll whatever scrolls around the ink, as if it were not there.
      const scroller = scrollParent(this.host);
      scroller?.scrollBy(this.scrolling.lastX - e.clientX, this.scrolling.lastY - e.clientY);
      this.scrolling.lastX = e.clientX;
      this.scrolling.lastY = e.clientY;
      return;
    }
    const active = this.active;
    if (active?.id !== e.pointerId) return;
    if (e.pointerType === 'pen') this.palm.lastPenAt = e.timeStamp;
    const samples =
      typeof e.getCoalescedEvents === 'function' && e.getCoalescedEvents().length > 0
        ? e.getCoalescedEvents()
        : [e];
    if (active.tool !== null) {
      active.tool.move(this.area, this.point(e));
      return;
    }
    if (active.erasing) {
      for (const s of samples) this.eraseAt(s);
      return;
    }
    const points = samples.map((s) => this.point(s));
    const last = points.at(-1);
    if (
      last &&
      this.lastMove &&
      Math.hypot(last.x - this.lastMove.x, last.y - this.lastMove.y) > STILL_PX
    ) {
      this.lastMove = { x: last.x, y: last.y, time: e.timeStamp };
    }
    this.recorder.add(points);
    this.requestFrame();
  }

  private onUp(e: PointerEvent, cancelled: boolean): void {
    if (this.scrolling?.id === e.pointerId) {
      this.scrolling = null;
      return;
    }
    const active = this.active;
    if (active?.id !== e.pointerId) return;
    this.active = null;
    if (active.tool !== null) {
      active.tool.up(this.area, this.point(e));
      return;
    }
    if (active.erasing) {
      if (this.erased) this.hooks.onChange([...this.strokes]);
      return;
    }
    if (cancelled && active.touch) {
      this.stop();
      return;
    }
    if (!cancelled) this.recorder.add([this.point(e)]);
    const recorded = this.recorder.end();
    this.clearLive();
    if (!recorded) return;
    const held =
      !cancelled &&
      recorded.points.length > 2 &&
      this.lastMove !== null &&
      e.timeStamp - this.lastMove.time >= HOLD_MS;
    let stroke: InkStroke | null = recorded;
    const erased = new Set<string>();
    for (const f of this.hooks.filters?.() ?? []) {
      if (stroke === null) break;
      try {
        const next = f.filter(stroke, {
          held,
          others: this.strokes,
          erase: (ids) => {
            for (const id of ids) erased.add(id);
          },
        });
        stroke =
          next === null ? null : next.points.length > 0 ? { ...next, id: recorded.id } : stroke;
      } catch {
        // A module's filter failing leaves the stroke as written.
      }
    }
    if (erased.size > 0) {
      this.strokes = this.strokes.filter((s) => !erased.has(s.id));
      if (stroke !== null) this.strokes.push(stroke);
      this.redraw();
    } else if (stroke !== null) {
      this.strokes.push(stroke);
      this.baseCtx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      drawStroke(this.baseCtx, stroke, this.hooks.dark?.() ?? false);
    } else {
      return;
    }
    this.hooks.onChange([...this.strokes]);
  }

  private eraseAt(e: PointerEvent): void {
    const { x, y } = this.point(e);
    const kept = this.strokes.filter((s) => !strokeHits(s, x, y, ERASER_RADIUS));
    if (kept.length === this.strokes.length) return;
    this.strokes = kept;
    this.erased = true;
    this.redraw();
  }

  /** Drops the stroke being written. */
  private stop(): void {
    this.recorder.cancel();
    this.active = null;
    this.clearLive();
  }

  private clearLive(): void {
    this.liveCtx.setTransform(1, 0, 0, 1, 0, 0);
    this.liveCtx.clearRect(0, 0, this.live.width, this.live.height);
  }

  private requestFrame(): void {
    if (this.frame !== null) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      const stroke = this.recorder.current;
      this.clearLive();
      if (!stroke) return;
      this.liveCtx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      drawStroke(this.liveCtx, stroke, this.hooks.dark?.() ?? false, false);
    });
  }
}

/** The nearest ancestor that scrolls. */
function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const { overflowY, overflowX } = getComputedStyle(p);
    if (/(auto|scroll)/.test(overflowY + overflowX)) return p;
  }
  return null;
}
