import { useEffect, useRef } from 'react';
import { keepPlaces, step, type GraphModel, type GraphPoint, type GraphStyle } from './model';

const PALETTES = {
  aurora: ['#50cddd', '#f58fba', '#eac873', '#8de4bd', '#a99cf6', '#fcaa7c'],
  ember: ['#f5b66f', '#f07c83', '#d6a4e8', '#e1d896', '#8bcac0', '#a4b7ee'],
  violet: ['#b8a0ff', '#73e4c0', '#f0a0d0', '#8ebcff', '#edd18f', '#eab0a0'],
};

/** How long the graph takes to grow in, and the view to glide, at the usual speed. */
const ENTRANCE_MS = 900;
const GLIDE_MS = 500;

const ease = (t: number) => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;

/**
 * The graph, drawn on a canvas. The layout is worked out once for a model;
 * how it looks is read as each frame is drawn, so changing an option never
 * rebuilds it. Four kinds of motion, each its own option: a live layout,
 * signals along the links, smooth focus on a note's neighbours, and an
 * entrance with a view that glides. None run where motion is reduced.
 *
 * It keeps still while you work elsewhere: the drift and the signals run
 * only while the pointer is over the graph or it has the keyboard, and a
 * new model (a note saved, a filter changed) keeps the places of the nodes
 * it already had, and the view, rather than starting again.
 */
export function GraphCanvas({
  model,
  style,
  fit,
  selected,
  onSelect,
  onOpen,
}: {
  model: GraphModel;
  style: GraphStyle;
  fit: number;
  selected: string | null;
  onSelect: (id: string | null) => void;
  onOpen: (path: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const invalidateRef = useRef<(() => void) | null>(null);
  const live = useRef({ onSelect, onOpen, selected, style });
  /** Where each node was last drawn, and the view, kept across new models. */
  const places = useRef(new Map<string, { x: number; y: number }>());
  const placesSpacing = useRef<number | null>(null);
  const view = useRef<{ x: number; y: number; zoom: number } | null>(null);
  const lastFit = useRef(fit);
  useEffect(() => {
    live.current = { onSelect, onOpen, selected, style };
    invalidateRef.current?.();
  }, [onSelect, onOpen, selected, style]);

  useEffect(() => {
    const element = canvasRef.current;
    if (!element) return;
    const canvas: HTMLCanvasElement = element;
    const context = canvas.getContext('2d');
    if (!context) return;
    const colours = getComputedStyle(canvas);
    const line = colours.getPropertyValue('--graph-line').trim();
    const text = colours.getPropertyValue('--graph-fg').trim();
    const background = colours.getPropertyValue('--graph-bg').trim();
    const phases = new Map(model.nodes.map((n, i) => [n.id, i * 0.037]));
    const groups = [...new Set(model.nodes.map((n) => n.group))].sort();
    const look = () => live.current.style;
    const colour = (n: GraphPoint) => {
      const s = look();
      const palette = s.palette === 'theme' ? [line] : PALETTES[s.palette];
      return palette[groups.indexOf(n.group) % palette.length] ?? line;
    };
    let width = 1,
      height = 1,
      frame = 0;
    let hover: GraphPoint | null = null;
    let camera = { x: 0, y: 0, zoom: 1 };
    /** Where the view is gliding from and to, and when it set off. */
    let glide: { from: typeof camera; to: typeof camera; start: number } | null = null;
    const pointers = new Map<number, { x: number; y: number }>();
    let gesture: { x: number; y: number; moved: boolean; node: GraphPoint | null } | null = null;
    let previousPinch = 0;
    let dirty = true;
    /** When the graph first drew, for growing in; null until then. */
    let born: number | null = null;
    /** How lit each node is, easing towards whether it is in focus. */
    const lit = new Map<string, number>();
    /** How far the focus effect has come in, from 0 to 1. */
    let focusMix = 0;
    let focused = new Set<string>();
    let focusId: string | null = null;
    /** Movement left in the live layout; it rests when this runs out. */
    let energy = 1;
    let lastSelection: string | null = null;
    let lastTime = 0;

    function invalidate() {
      dirty = true;
      if (!frame) frame = requestAnimationFrame(draw);
    }
    invalidateRef.current = invalidate;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const moving = () =>
      document.documentElement.dataset['motion'] !== 'off' && !reduced.matches && !document.hidden;
    const radius = (n: GraphPoint) => look().size + Math.min(10, Math.sqrt(n.degree) * 1.7);
    /** How far the graph has grown in, from 0 to 1. */
    let grown = 1;
    const project = (n: GraphPoint) => ({
      x: width / 2 + (n.x * grown + camera.x) * camera.zoom,
      y: height / 2 + (n.y * grown + camera.y) * camera.zoom,
    });
    const hit = (x: number, y: number) =>
      model.nodes.find((n) => {
        const p = project(n);
        return Math.hypot(p.x - x, p.y - y) < Math.max(10, radius(n) * Math.sqrt(camera.zoom) + 4);
      }) ?? null;

    /** Moves the view, gliding if that is on. */
    function moveCamera(to: typeof camera) {
      if (look().entrance && moving() && born !== null) {
        glide = { from: { ...camera }, to, start: performance.now() };
      } else {
        camera = to;
        glide = null;
      }
      invalidate();
    }
    function fitted(): typeof camera {
      let minX = 0,
        maxX = 0,
        minY = 0,
        maxY = 0;
      for (const n of model.nodes) {
        minX = Math.min(minX, n.x);
        maxX = Math.max(maxX, n.x);
        minY = Math.min(minY, n.y);
        maxY = Math.max(maxY, n.y);
      }
      return {
        x: -(minX + maxX) / 2,
        y: -(minY + maxY) / 2,
        zoom: Math.max(
          0.03,
          Math.min(2, (width - 100) / (maxX - minX + 100), (height - 110) / (maxY - minY + 100)),
        ),
      };
    }
    function settle() {
      // Settle before showing it, so it is readable with no motion at all.
      const rounds = Math.min(
        300,
        Math.max(60, Math.floor(24000 / Math.max(1, model.nodes.length))),
      );
      for (let i = 0; i < rounds; i++) step(model, look().spacing);
      energy = 0.15;
    }
    // Places from before are kept unless the spacing changed; Fit only moves the view.
    const refit = fit !== lastFit.current;
    lastFit.current = fit;
    const placeMap = places.current;
    if (placesSpacing.current !== look().spacing) placeMap.clear();
    placesSpacing.current = look().spacing;
    const kept = keepPlaces(model, placeMap, look().spacing);
    /** Already on show before this model, so it does not grow in again. */
    const shown = kept > 0;
    if (shown) energy = 0.05;
    else settle();
    /** The view stays where it was, unless this is the first look or Fit was pressed. */
    let placedView = view.current !== null && !refit;
    if (placedView && view.current) camera = { ...view.current };
    /** The pointer is over the graph, or it has the keyboard: only then does it drift. */
    let engaged = false;
    function resize() {
      const box = canvas.getBoundingClientRect();
      width = box.width;
      height = box.height;
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context?.setTransform(ratio, 0, 0, ratio, 0, 0);
      if (!placedView) {
        camera = fitted();
        placedView = true;
      }
      glide = null;
      invalidate();
    }

    function draw(now: number) {
      frame = 0;
      if (document.hidden || !context) return;
      const s = look();
      const can = moving();
      const speed = s.speed;
      const dt = Math.min(64, lastTime === 0 ? 16 : now - lastTime);
      lastTime = now;
      let busy = false;

      // Growing in.
      if (born === null) born = now;
      if (s.entrance && can && !shown) {
        const t = ((now - born) * speed) / ENTRANCE_MS;
        grown = ease(t);
        if (t < 1) busy = true;
      } else {
        grown = 1;
      }

      // The view gliding to where it was sent.
      if (glide !== null) {
        const t = ((now - glide.start) * speed) / GLIDE_MS;
        const k = ease(t);
        camera = {
          x: glide.from.x + (glide.to.x - glide.from.x) * k,
          y: glide.from.y + (glide.to.y - glide.from.y) * k,
          zoom: glide.from.zoom + (glide.to.zoom - glide.from.zoom) * k,
        };
        if (t >= 1) glide = null;
        else busy = true;
      }

      // The live layout: it keeps working while there is movement in it.
      const held = gesture?.moved === true ? gesture.node : null;
      if (s.live && can && (energy > 0.02 || held !== null)) {
        const hx = held?.x ?? 0;
        const hy = held?.y ?? 0;
        step(model, s.spacing);
        if (held !== null) {
          // The node being dragged stays under the finger; the rest answer it.
          held.x = hx;
          held.y = hy;
          held.vx = 0;
          held.vy = 0;
          energy = 1;
        } else {
          energy *= 0.985 ** (dt / 16);
        }
        busy = true;
      }

      // Focus: a note's neighbours light up, the rest dim, smoothly.
      const selectedId = live.current.selected;
      const active = hover?.id ?? selectedId;
      if (active !== focusId) {
        focusId = active;
        if (active !== null) {
          focused = new Set([active]);
          for (const e of model.edges)
            if (e.source.id === active || e.target.id === active) {
              focused.add(e.source.id);
              focused.add(e.target.id);
            }
        }
      }
      const smooth = s.focus && can;
      const rate = smooth ? Math.min(1, (dt / 140) * speed) : 1;
      const mixTarget = active !== null ? 1 : 0;
      if (Math.abs(focusMix - mixTarget) > 0.01) {
        focusMix += (mixTarget - focusMix) * rate;
        busy = true;
      } else {
        focusMix = mixTarget;
        if (active === null) focused = new Set();
      }
      for (const n of model.nodes) {
        const target = focused.size === 0 || focused.has(n.id) ? 1 : 0;
        const value = lit.get(n.id) ?? 1;
        if (Math.abs(value - target) > 0.01) {
          lit.set(n.id, value + (target - value) * rate);
          busy = true;
        } else {
          lit.set(n.id, target);
        }
      }
      const shine = (n: GraphPoint) => {
        const l = lit.get(n.id) ?? 1;
        // Lit nodes are full; unlit ones dim as the focus comes in.
        return 1 - (1 - l) * 0.8 * focusMix;
      };

      const flow = s.motion && can && engaged;
      if (flow) busy = true;
      // A slow drift while you are looking at it, so it feels alive; still otherwise.
      const drift = s.live && can && engaged;
      if (drift) busy = true;
      const sway = (n: GraphPoint) => {
        if (!drift || n === held) return { x: 0, y: 0 };
        const ph = (phases.get(n.id) ?? 0) * 40;
        const t = (now * speed) / 2600;
        return { x: Math.sin(t + ph) * 2.2, y: Math.cos(t * 0.8 + ph * 1.3) * 2.2 };
      };
      const at = (n: GraphPoint) => {
        const p = project(n);
        const w = sway(n);
        return { x: p.x + w.x, y: p.y + w.y };
      };

      if (busy || dirty || selectedId !== lastSelection) {
        dirty = false;
        lastSelection = selectedId;
        context.clearRect(0, 0, width, height);
        const appear = grown;
        for (const e of model.edges) {
          const a = at(e.source),
            b = at(e.target);
          const highlighted = active !== null && (e.source.id === active || e.target.id === active);
          // In focus, a note's own links brighten and the others fade back.
          const target = highlighted ? 0.9 : 0.06;
          context.globalAlpha = appear * (s.opacity + (target - s.opacity) * focusMix);
          context.strokeStyle = highlighted ? colour(e.source) : line;
          context.lineWidth = highlighted ? 1.5 : 0.7;
          context.beginPath();
          context.moveTo(a.x, a.y);
          context.lineTo(b.x, b.y);
          context.stroke();
          if (flow && (highlighted || (active === null && e.source.degree > 1))) {
            const progress = ((now * speed) / 4200 + (phases.get(e.source.id) ?? 0) * 9) % 1;
            // A signal with a short tail, fading in and out at the ends.
            for (let k = 0; k < 3; k++) {
              const t = progress - k * 0.035;
              if (t < 0) continue;
              context.globalAlpha = appear * Math.sin(Math.PI * t) * (0.8 - k * 0.25);
              context.fillStyle = colour(e.source);
              context.beginPath();
              context.arc(
                a.x + (b.x - a.x) * t,
                a.y + (b.y - a.y) * t,
                1.8 - k * 0.4,
                0,
                Math.PI * 2,
              );
              context.fill();
            }
          }
        }
        const labelBoxes: { x: number; y: number; w: number; h: number }[] = [];
        for (const n of model.nodes) {
          const p = at(n),
            r = Math.max(2, radius(n) * Math.sqrt(camera.zoom)) * (0.4 + 0.6 * appear);
          if (p.x < -100 || p.y < -100 || p.x > width + 100 || p.y > height + 100) continue;
          const level = shine(n);
          const bright = level > 0.6;
          context.globalAlpha = appear * level;
          context.fillStyle = colour(n);
          if (s.glow && bright) {
            context.shadowColor = colour(n);
            const pulse = flow
              ? 2 * Math.sin((now * speed) / 900 + (phases.get(n.id) ?? 0) * 30)
              : 0;
            context.shadowBlur = (active === n.id ? 25 : 12) + pulse;
          }
          context.beginPath();
          if (n.kind === 'document') {
            context.moveTo(p.x, p.y - r);
            context.lineTo(p.x + r, p.y);
            context.lineTo(p.x, p.y + r);
            context.lineTo(p.x - r, p.y);
            context.closePath();
          } else context.arc(p.x, p.y, r, 0, Math.PI * 2);
          context.fill();
          context.shadowBlur = 0;
          if (n.kind === 'tag') {
            context.strokeStyle = colour(n);
            context.lineWidth = 1;
            context.beginPath();
            context.arc(p.x, p.y, r + 4, 0, Math.PI * 2);
            context.stroke();
          }
          if (active === n.id) {
            context.strokeStyle = text;
            context.lineWidth = 1.5;
            context.beginPath();
            context.arc(p.x, p.y, r + 6, 0, Math.PI * 2);
            context.stroke();
          }
          if (
            bright &&
            appear > 0.7 &&
            ((s.labels && (model.nodes.length < 70 || n.degree > 2 || camera.zoom > 1.2)) ||
              active === n.id)
          ) {
            context.font = `${active === n.id ? '600 ' : ''}11px Inter, sans-serif`;
            context.textAlign = 'center';
            const label = n.title.length > 38 ? n.title.slice(0, 35) + '…' : n.title;
            const w = context.measureText(label).width + 12;
            const box = { x: p.x - w / 2, y: p.y + r + 5, w, h: 18 };
            const overlaps = labelBoxes.some(
              (b) =>
                box.x < b.x + b.w &&
                box.x + box.w > b.x &&
                box.y < b.y + b.h &&
                box.y + box.h > b.y,
            );
            if (!overlaps || active === n.id) {
              labelBoxes.push(box);
              context.fillStyle = background;
              context.fillRect(box.x, box.y, box.w, box.h);
              context.fillStyle = text;
              context.fillText(label, p.x, p.y + r + 17);
            }
          }
        }
        context.globalAlpha = 1;
      }
      if (busy) frame = requestAnimationFrame(draw);
    }

    function point(e: PointerEvent) {
      const box = canvas.getBoundingClientRect();
      return { x: e.clientX - box.left, y: e.clientY - box.top };
    }
    function down(e: PointerEvent) {
      const p = point(e);
      pointers.set(e.pointerId, p);
      canvas.setPointerCapture(e.pointerId);
      gesture = { ...p, moved: false, node: hit(p.x, p.y) };
      previousPinch = 0;
      glide = null;
    }
    function zoom(factor: number, x: number, y: number) {
      const old = camera.zoom,
        next = Math.max(0.03, Math.min(5, old * factor));
      glide = null;
      camera.x += (x - width / 2) * (1 / next - 1 / old);
      camera.y += (y - height / 2) * (1 / next - 1 / old);
      camera.zoom = next;
      invalidate();
    }
    function move(e: PointerEvent) {
      const p = point(e);
      if (!pointers.has(e.pointerId) || !gesture) {
        const over = hit(p.x, p.y);
        if (over !== hover) {
          hover = over;
          invalidate();
        }
        return;
      }
      const previous = pointers.get(e.pointerId);
      if (!previous) return;
      pointers.set(e.pointerId, p);
      if (pointers.size > 1) {
        const pair = [...pointers.values()];
        const a = pair[0],
          b = pair[1];
        if (!a || !b) return;
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        if (previousPinch) zoom(distance / previousPinch, (a.x + b.x) / 2, (a.y + b.y) / 2);
        previousPinch = distance;
        gesture.moved = true;
        return;
      }
      if (Math.hypot(p.x - gesture.x, p.y - gesture.y) > 4) gesture.moved = true;
      if (gesture.moved) {
        const dx = (p.x - previous.x) / camera.zoom,
          dy = (p.y - previous.y) / camera.zoom;
        if (gesture.node) {
          gesture.node.x += dx;
          gesture.node.y += dy;
          energy = 1;
        } else {
          camera.x += dx;
          camera.y += dy;
        }
        invalidate();
      }
    }
    function up(e: PointerEvent) {
      if (gesture && !gesture.moved) {
        const node = gesture.node;
        live.current.onSelect(node?.id ?? null);
        // The view glides to a chosen note, keeping a close look close.
        if (node !== null && look().entrance && moving()) {
          moveCamera({ x: -node.x, y: -node.y, zoom: Math.max(camera.zoom, 0.9) });
        }
      }
      pointers.delete(e.pointerId);
      gesture = null;
      previousPinch = 0;
      invalidate();
    }
    function cancel(e: PointerEvent) {
      pointers.delete(e.pointerId);
      gesture = null;
      previousPinch = 0;
    }
    function wheel(e: WheelEvent) {
      e.preventDefault();
      const box = canvas.getBoundingClientRect();
      zoom(Math.exp(-e.deltaY * 0.001), e.clientX - box.left, e.clientY - box.top);
    }
    function double(e: MouseEvent) {
      const box = canvas.getBoundingClientRect();
      const n = hit(e.clientX - box.left, e.clientY - box.top);
      if (n?.path) live.current.onOpen(n.path);
    }
    function key(e: KeyboardEvent) {
      if (e.key === '+' || e.key === '=') zoom(1.2, width / 2, height / 2);
      else if (e.key === '-') zoom(1 / 1.2, width / 2, height / 2);
      else if (e.key === '0') moveCamera(fitted());
      else if (e.key === 'Escape') live.current.onSelect(null);
      else return;
      e.preventDefault();
    }
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', cancel);
    canvas.addEventListener('wheel', wheel, { passive: false });
    canvas.addEventListener('dblclick', double);
    canvas.addEventListener('keydown', key);
    invalidate();
    const leave = () => {
      hover = null;
      engaged = document.activeElement === canvas;
      invalidate();
    };
    const enter = () => {
      engaged = true;
      lastTime = 0;
      invalidate();
    };
    canvas.addEventListener('pointerleave', leave);
    canvas.addEventListener('pointerenter', enter);
    canvas.addEventListener('focus', enter);
    canvas.addEventListener('blur', leave);
    reduced.addEventListener('change', invalidate);
    const motionObserver = new MutationObserver(invalidate);
    motionObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-motion'],
    });
    // The canvas is idle when hidden; it draws again when it comes back.
    const visible = () => {
      lastTime = 0;
      invalidate();
    };
    document.addEventListener('visibilitychange', visible);
    return () => {
      cancelAnimationFrame(frame);
      invalidateRef.current = null;
      for (const n of model.nodes) placeMap.set(n.id, { x: n.x, y: n.y });
      view.current = glide?.to ?? camera;
      canvas.removeEventListener('pointerenter', enter);
      canvas.removeEventListener('focus', enter);
      canvas.removeEventListener('blur', leave);
      motionObserver.disconnect();
      reduced.removeEventListener('change', invalidate);
      canvas.removeEventListener('pointerleave', leave);
      observer.disconnect();
      document.removeEventListener('visibilitychange', visible);
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', cancel);
      canvas.removeEventListener('wheel', wheel);
      canvas.removeEventListener('dblclick', double);
      canvas.removeEventListener('keydown', key);
    };
    // How it looks is read as it draws; only a new model, or Fit, starts it afresh.
  }, [model, fit]);
  return (
    <canvas
      ref={canvasRef}
      tabIndex={0}
      role="img"
      aria-label="Interactive knowledge graph. Drag nodes or the background. Scroll or pinch to zoom. Keyboard: plus and minus to zoom, zero to fit, Escape to clear. Use Browse files below for keyboard file navigation."
    />
  );
}
