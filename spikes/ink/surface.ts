import { createMetrics, longFrames, resetMetrics, sampleRate, type SpikeMetrics } from './metrics';
import { decide, type PalmRules, type PalmState } from './palm';
import {
  drawStroke,
  strokeBounds,
  unionRect,
  type Drawable,
  type Rect,
  type RendererKind,
} from './render';
import { stressStrokes } from './stress';
import {
  inkFileBytes,
  StrokeRecorder,
  strokePressure,
  type InkPoint,
  type InkSource,
  type InkStroke,
  type RawPoint,
} from './stroke';

/**
 * The ink area. One canvas is on screen; finished strokes are also kept in
 * an off-screen cache canvas. Each frame copies the area under the live
 * stroke back from the cache, then draws the live stroke on top, so drawing
 * costs the same however many strokes the page holds.
 */

export interface SurfaceOptions {
  renderer: RendererKind;
  /** Draw the browser's predicted pen points ahead of the real ones. */
  predicted: boolean;
  /** Ask for a low-latency (desynchronized) canvas. */
  lowLatency: boolean;
  /** Use `pointerrawupdate`, which fires as soon as input arrives, instead of `pointermove`. */
  rawUpdates: boolean;
  rules: PalmRules;
}

export interface Features {
  secureContext: boolean;
  coalescedEvents: boolean;
  predictedEvents: boolean;
  rawUpdate: boolean;
  /** Whether the canvas really is desynchronized; null until known. */
  desynchronized: boolean | null;
}

export interface LastPointer {
  type: string;
  pressure: number;
  tiltX: number;
  tiltY: number;
  width: number;
  height: number;
}

export interface SurfaceStatus {
  strokes: number;
  inkBytes: number;
  features: Features;
  lastPointer: LastPointer | null;
  /** The last thing palm rejection did, for the status panel. */
  lastRejection: string | null;
}

const BACKGROUND = '#ffffff';
const INK = '#1f2937';
const WIDTH = 3;

function sourceOf(pointerType: string): InkSource {
  return pointerType === 'pen' ? 'pen' : pointerType === 'touch' ? 'touch' : 'mouse';
}

function detectFeatures(): Omit<Features, 'desynchronized'> {
  return {
    secureContext: window.isSecureContext,
    coalescedEvents: 'getCoalescedEvents' in PointerEvent.prototype,
    predictedEvents: 'getPredictedEvents' in PointerEvent.prototype,
    rawUpdate: 'onpointerrawupdate' in window,
  };
}

export class InkSurface {
  readonly metrics: SpikeMetrics = createMetrics();
  private readonly cache: HTMLCanvasElement;
  private readonly cacheCtx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private desynchronized: boolean | null = null;
  private readonly features = detectFeatures();
  private readonly strokes: InkStroke[] = [];
  private readonly recorder = new StrokeRecorder();
  private readonly palm: PalmState = { lastPenAt: null };
  private active: { id: number; rect: DOMRect } | null = null;
  private scrolling: { id: number; lastY: number } | null = null;
  private predicted: InkPoint[] = [];
  /** Events handled since the last frame: event time and handler time. */
  private pending: { event: number; handler: number }[] = [];
  private liveBounds: Rect | null = null;
  private frame: number | null = null;
  private lastFrameAt: number | null = null;
  private dpr = 1;
  private cssWidth = 0;
  private cssHeight = 0;
  private lastPointer: LastPointer | null = null;
  private lastRejection: string | null = null;
  private readonly resize: ResizeObserver;
  private readonly cleanups: (() => void)[] = [];

  constructor(
    private readonly host: HTMLElement,
    private readonly scroller: HTMLElement,
    private options: SurfaceOptions,
  ) {
    this.cache = document.createElement('canvas');
    this.cacheCtx = context(this.cache, false);
    this.canvas = document.createElement('canvas');
    this.ctx = this.makeVisible(options.lowLatency);
    this.listen(host, 'pointerdown', (e) => {
      this.onDown(e);
    });
    this.listen(host, 'pointermove', (e) => {
      this.onMove(e);
    });
    this.listen(host, 'pointerrawupdate', (e) => {
      this.onMove(e);
    });
    this.listen(host, 'pointerup', (e) => {
      this.onUp(e, false);
    });
    this.listen(host, 'pointercancel', (e) => {
      this.onUp(e, true);
    });
    // A hovering pen anywhere on the page counts as the pen being near.
    this.listen(window, 'pointermove', (e) => {
      if (e.pointerType === 'pen') this.penSeen(e.timeStamp);
    });
    this.resize = new ResizeObserver(() => {
      this.fit();
    });
    this.resize.observe(host);
    this.fit();
  }

  setOptions(next: Partial<SurfaceOptions>): void {
    const lowLatencyChanged =
      next.lowLatency !== undefined && next.lowLatency !== this.options.lowLatency;
    this.options = { ...this.options, ...next };
    if (lowLatencyChanged) {
      // Context settings are fixed once made, so a new canvas is needed.
      this.canvas.remove();
      this.canvas = document.createElement('canvas');
      this.ctx = this.makeVisible(this.options.lowLatency);
      this.fit();
    } else if (next.renderer !== undefined) {
      this.redrawAll();
    }
  }

  status(): SurfaceStatus {
    return {
      strokes: this.strokes.length,
      inkBytes: inkFileBytes(this.strokes),
      features: { ...this.features, desynchronized: this.desynchronized },
      lastPointer: this.lastPointer,
      lastRejection: this.lastRejection,
    };
  }

  clear(): void {
    this.strokes.length = 0;
    this.recorder.cancel();
    this.active = null;
    this.redrawAll();
  }

  /** Adds handwriting-like strokes to test redraw cost and file size. */
  loadStress(count: number): void {
    this.strokes.push(...stressStrokes(count, this.cssWidth, this.cssHeight));
    this.redrawAll();
  }

  resetStats(): void {
    resetMetrics(this.metrics);
  }

  /** Everything measured, for the results file. */
  report(): unknown {
    const m = this.metrics;
    return {
      measuredAt: new Date().toISOString(),
      userAgent: navigator.userAgent,
      devicePixelRatio: this.dpr,
      inkArea: { width: this.cssWidth, height: this.cssHeight },
      options: this.options,
      status: this.status(),
      inputToHandlerMs: m.inputToHandler.summary(),
      handlerToDrawnMs: m.handlerToDrawn.summary(),
      inputToDrawnMs: m.inputToDrawn.summary(),
      penSamplesPerSecond: m.penSampleRate.summary(),
      frames: { count: m.frameIntervals.length, long: longFrames(m.frameIntervals) },
      fullRedrawMs: m.fullRedraw.summary(),
    };
  }

  destroy(): void {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.resize.disconnect();
    for (const cleanup of this.cleanups) cleanup();
    this.canvas.remove();
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

  private makeVisible(lowLatency: boolean): CanvasRenderingContext2D {
    this.canvas.className = 'ink-canvas';
    this.host.append(this.canvas);
    const ctx = context(this.canvas, lowLatency);
    this.desynchronized = ctx.getContextAttributes().desynchronized ?? false;
    return ctx;
  }

  /** Sizes both canvases to the ink area and redraws. */
  private fit(): void {
    const rect = this.host.getBoundingClientRect();
    this.dpr = window.devicePixelRatio || 1;
    this.cssWidth = rect.width;
    this.cssHeight = rect.height;
    for (const c of [this.canvas, this.cache]) {
      c.width = Math.max(1, Math.round(rect.width * this.dpr));
      c.height = Math.max(1, Math.round(rect.height * this.dpr));
    }
    this.redrawAll();
  }

  private redrawAll(): void {
    const started = performance.now();
    const c = this.cacheCtx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = BACKGROUND;
    c.fillRect(0, 0, this.cache.width, this.cache.height);
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    for (const stroke of this.strokes) drawStroke(c, stroke, this.options.renderer, true);
    this.metrics.fullRedraw.add(performance.now() - started);
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.drawImage(this.cache, 0, 0);
    this.liveBounds = null;
  }

  /** Copies an area back from the cache onto the visible canvas. */
  private restore(area: Rect): void {
    const d = this.dpr;
    const x = Math.max(0, Math.floor(area.x * d));
    const y = Math.max(0, Math.floor(area.y * d));
    const w = Math.min(this.canvas.width, Math.ceil((area.x + area.w) * d)) - x;
    const h = Math.min(this.canvas.height, Math.ceil((area.y + area.h) * d)) - y;
    if (w <= 0 || h <= 0) return;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.drawImage(this.cache, x, y, w, h, x, y, w, h);
  }

  private penSeen(time: number): void {
    this.palm.lastPenAt = time;
    // A palm usually lands just before the pen. Drop the stroke it started.
    if (this.active && this.recorder.current?.source === 'touch') {
      this.recorder.cancel();
      this.active = null;
      this.predicted = [];
      this.lastRejection = 'Cancelled a touch stroke when the pen arrived';
      this.requestFrame();
    }
  }

  private notePointer(e: PointerEvent): void {
    this.lastPointer = {
      type: e.pointerType,
      pressure: e.pressure,
      tiltX: e.tiltX,
      tiltY: e.tiltY,
      width: e.width,
      height: e.height,
    };
  }

  private point(e: PointerEvent, rect: DOMRect): RawPoint {
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      pressure: strokePressure(e.pointerType, e.pressure),
      time: e.timeStamp,
    };
  }

  private onDown(e: PointerEvent): void {
    this.notePointer(e);
    if (e.pointerType === 'pen') this.penSeen(e.timeStamp);
    if (this.active) {
      if (e.pointerType === 'touch') this.lastRejection = 'Ignored a touch while drawing';
      return;
    }
    const decision = decide(
      { pointerType: e.pointerType, width: e.width, height: e.height, time: e.timeStamp },
      this.palm,
      this.options.rules,
    );
    if (decision.action === 'ignore') {
      this.lastRejection =
        decision.reason === 'pen-nearby'
          ? 'Ignored a touch near the pen'
          : `Ignored a large touch (${String(Math.round(Math.max(e.width, e.height)))} px)`;
      return;
    }
    capture(this.host, e.pointerId);
    if (decision.action === 'scroll') {
      this.scrolling = { id: e.pointerId, lastY: e.clientY };
      return;
    }
    const rect = this.host.getBoundingClientRect();
    this.active = { id: e.pointerId, rect };
    this.recorder.begin(sourceOf(e.pointerType), INK, WIDTH, this.point(e, rect));
    this.lastFrameAt = null;
    this.handled(e);
  }

  private onMove(e: PointerEvent): void {
    if (this.scrolling?.id === e.pointerId) {
      if (e.type !== 'pointermove') return;
      this.scroller.scrollBy(0, this.scrolling.lastY - e.clientY);
      this.scrolling.lastY = e.clientY;
      return;
    }
    const active = this.active;
    if (active?.id !== e.pointerId) return;
    const wanted =
      this.options.rawUpdates && this.features.rawUpdate ? 'pointerrawupdate' : 'pointermove';
    if (e.type !== wanted) return;
    this.notePointer(e);
    if (e.pointerType === 'pen') this.palm.lastPenAt = e.timeStamp;
    const coalesced = this.features.coalescedEvents ? e.getCoalescedEvents() : [];
    const samples = coalesced.length > 0 ? coalesced : [e];
    this.recorder.add(samples.map((s) => this.point(s, active.rect)));
    if (this.options.predicted && this.features.predictedEvents) {
      const stroke = this.recorder.current;
      const lastT = stroke?.points.at(-1)?.t ?? 0;
      this.predicted = e.getPredictedEvents().map((p) => {
        const raw = this.point(p, active.rect);
        return { x: raw.x, y: raw.y, pressure: raw.pressure, t: lastT };
      });
    } else {
      this.predicted = [];
    }
    this.handled(e);
  }

  private onUp(e: PointerEvent, cancelled: boolean): void {
    if (this.scrolling?.id === e.pointerId) {
      this.scrolling = null;
      return;
    }
    const active = this.active;
    if (active?.id !== e.pointerId) return;
    this.active = null;
    this.predicted = [];
    if (cancelled && e.pointerType === 'touch') {
      this.recorder.cancel();
      this.requestFrame();
      return;
    }
    if (!cancelled) this.recorder.add([this.point(e, active.rect)]);
    const stroke = this.recorder.end();
    if (!stroke) return;
    this.strokes.push(stroke);
    this.cacheCtx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    drawStroke(this.cacheCtx, stroke, this.options.renderer, true);
    if (stroke.source === 'pen') {
      const rate = sampleRate(stroke.points);
      if (rate !== null) this.metrics.penSampleRate.add(rate);
    }
    this.requestFrame();
  }

  /** Notes an event's timing and asks for a frame to draw it. */
  private handled(e: PointerEvent): void {
    const now = performance.now();
    this.metrics.inputToHandler.add(now - e.timeStamp);
    this.pending.push({ event: e.timeStamp, handler: now });
    this.requestFrame();
  }

  private requestFrame(): void {
    if (this.frame !== null) return;
    this.frame = requestAnimationFrame((time) => {
      this.frame = null;
      this.draw(time);
    });
  }

  private draw(frameTime: number): void {
    const stroke = this.recorder.current;
    const live: Drawable | null = stroke
      ? { ...stroke, points: [...stroke.points, ...this.predicted] }
      : null;
    const bounds = live ? strokeBounds(live.points, live.width) : null;
    const dirty = unionRect(this.liveBounds, bounds);
    if (dirty) this.restore(dirty);
    if (live) {
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      drawStroke(this.ctx, live, this.options.renderer, false);
    }
    this.liveBounds = bounds;

    const drawn = performance.now();
    for (const p of this.pending) {
      this.metrics.handlerToDrawn.add(drawn - p.handler);
      this.metrics.inputToDrawn.add(drawn - p.event);
    }
    this.pending = [];
    // Keep a frame running while the pen is down, so pauses in movement do
    // not count as slow frames.
    if (this.active) {
      if (this.lastFrameAt !== null) this.metrics.frameIntervals.push(frameTime - this.lastFrameAt);
      this.lastFrameAt = frameTime;
      this.requestFrame();
    } else {
      this.lastFrameAt = null;
    }
  }
}

function context(canvas: HTMLCanvasElement, lowLatency: boolean): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d', { alpha: false, desynchronized: lowLatency });
  if (!ctx) throw new Error('This browser has no 2D canvas');
  return ctx;
}

/** Pointer capture fails for synthetic events in tests; drawing works without it. */
function capture(el: HTMLElement, id: number): void {
  try {
    el.setPointerCapture(id);
  } catch {
    // Not a live pointer.
  }
}
