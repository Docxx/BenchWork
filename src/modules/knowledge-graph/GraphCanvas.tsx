import { useEffect, useRef } from 'react';
import { step, type GraphModel, type GraphPoint, type GraphStyle } from './model';

const PALETTES = {
  aurora: ['#50cddd', '#f58fba', '#eac873', '#8de4bd', '#a99cf6', '#fcaa7c'],
  ember: ['#f5b66f', '#f07c83', '#d6a4e8', '#e1d896', '#8bcac0', '#a4b7ee'],
  violet: ['#b8a0ff', '#73e4c0', '#f0a0d0', '#8ebcff', '#edd18f', '#eab0a0'],
};

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
  const callbacks = useRef({ onSelect, onOpen, selected });
  useEffect(() => {
    callbacks.current = { onSelect, onOpen, selected };
    invalidateRef.current?.();
  }, [onSelect, onOpen, selected]);
  useEffect(() => {
    const element = canvasRef.current;
    if (!element) return;
    const canvas: HTMLCanvasElement = element;
    const context = canvas.getContext('2d');
    if (!context) return;
    const colours = getComputedStyle(canvas);
    const line = colours.getPropertyValue('--graph-line').trim();
    const text = colours.getPropertyValue('--graph-fg').trim();
    const palette = style.palette === 'theme' ? [line] : PALETTES[style.palette];
    const phases = new Map(model.nodes.map((n, i) => [n.id, i * 0.037]));
    const groups = [...new Set(model.nodes.map((n) => n.group))].sort();
    const colour = (n: GraphPoint) => palette[groups.indexOf(n.group) % palette.length] ?? line;
    let width = 1,
      height = 1,
      frame = 0;
    let hover: GraphPoint | null = null;
    let camera = { x: 0, y: 0, zoom: 1 };
    const pointers = new Map<number, { x: number; y: number }>();
    let gesture: { x: number; y: number; moved: boolean; node: GraphPoint | null } | null = null;
    let previousPinch = 0;
    let dirty = true;
    function invalidate() {
      dirty = true;
      if (!frame) frame = requestAnimationFrame(draw);
    }
    invalidateRef.current = invalidate;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const radius = (n: GraphPoint) => style.size + Math.min(10, Math.sqrt(n.degree) * 1.7);
    const project = (n: GraphPoint) => ({
      x: width / 2 + (n.x + camera.x) * camera.zoom,
      y: height / 2 + (n.y + camera.y) * camera.zoom,
    });
    const hit = (x: number, y: number) =>
      model.nodes.find((n) => {
        const p = project(n);
        return Math.hypot(p.x - x, p.y - y) < Math.max(10, radius(n) * Math.sqrt(camera.zoom) + 4);
      }) ?? null;
    function fitGraph() {
      const xs = model.nodes.map((n) => n.x),
        ys = model.nodes.map((n) => n.y);
      let minX = 0,
        maxX = 0,
        minY = 0,
        maxY = 0;
      for (const x of xs) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
      }
      for (const y of ys) {
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
      camera = {
        x: -(minX + maxX) / 2,
        y: -(minY + maxY) / 2,
        zoom: Math.max(
          0.03,
          Math.min(2, (width - 100) / (maxX - minX + 100), (height - 110) / (maxY - minY + 100)),
        ),
      };
      invalidate();
    }
    // Settle before showing it, so reduced-motion users also get a readable layout.
    for (
      let i = 0;
      i < Math.min(300, Math.max(60, Math.floor(24000 / Math.max(1, model.nodes.length))));
      i++
    )
      step(model, style.spacing);
    function resize() {
      const box = canvas.getBoundingClientRect();
      width = box.width;
      height = box.height;
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context?.setTransform(ratio, 0, 0, ratio, 0, 0);
      fitGraph();
    }
    function draw(now: number) {
      frame = 0;
      if (document.hidden) return;
      if (!context) return;
      const animate =
        style.motion &&
        document.documentElement.dataset['motion'] !== 'off' &&
        !reduced.matches &&
        !document.hidden;
      const selectedId = callbacks.current.selected;
      if (animate || dirty || selectedId !== lastSelection) {
        dirty = false;
        lastSelection = selectedId;
        context.clearRect(0, 0, width, height);
        const active = hover?.id ?? selectedId;
        const neighbours = new Set<string>(active ? [active] : []);
        for (const e of model.edges)
          if (e.source.id === active || e.target.id === active) {
            neighbours.add(e.source.id);
            neighbours.add(e.target.id);
          }
        for (const e of model.edges) {
          const a = project(e.source),
            b = project(e.target);
          const highlighted = e.source.id === active || e.target.id === active;
          context.globalAlpha = active ? (highlighted ? 0.9 : 0.06) : style.opacity;
          context.strokeStyle = highlighted ? colour(e.source) : line;
          context.lineWidth = highlighted ? 1.5 : 0.7;
          context.beginPath();
          context.moveTo(a.x, a.y);
          context.lineTo(b.x, b.y);
          context.stroke();
          if (animate && (highlighted || (!active && e.source.degree > 2))) {
            const progress = (now / 5500 + (phases.get(e.source.id) ?? 0)) % 1;
            context.globalAlpha = 0.7;
            context.fillStyle = colour(e.source);
            context.beginPath();
            context.arc(
              a.x + (b.x - a.x) * progress,
              a.y + (b.y - a.y) * progress,
              1.5,
              0,
              Math.PI * 2,
            );
            context.fill();
          }
        }
        const labelBoxes: { x: number; y: number; w: number; h: number }[] = [];
        for (const n of model.nodes) {
          const p = project(n),
            r = Math.max(2, radius(n) * Math.sqrt(camera.zoom));
          if (p.x < -100 || p.y < -100 || p.x > width + 100 || p.y > height + 100) continue;
          const bright = !active || neighbours.has(n.id);
          context.globalAlpha = bright ? 1 : 0.2;
          context.fillStyle = colour(n);
          if (style.glow && bright) {
            context.shadowColor = colour(n);
            context.shadowBlur = active === n.id ? 25 : 12;
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
            ((style.labels && (model.nodes.length < 70 || n.degree > 2 || camera.zoom > 1.2)) ||
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
              context.fillStyle = colours.getPropertyValue('--graph-bg').trim();
              context.fillRect(box.x, box.y, box.w, box.h);
              context.fillStyle = text;
              context.fillText(label, p.x, p.y + r + 17);
            }
          }
        }
        context.globalAlpha = 1;
      }
      if (animate) frame = requestAnimationFrame(draw);
    }
    let lastSelection: string | null = null;
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
    }
    function zoom(factor: number, x: number, y: number) {
      const old = camera.zoom,
        next = Math.max(0.03, Math.min(5, old * factor));
      camera.x += (x - width / 2) * (1 / next - 1 / old);
      camera.y += (y - height / 2) * (1 / next - 1 / old);
      camera.zoom = next;
      invalidate();
    }
    function move(e: PointerEvent) {
      const p = point(e);
      if (!pointers.has(e.pointerId) || !gesture) {
        hover = hit(p.x, p.y);
        invalidate();
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
        } else {
          camera.x += dx;
          camera.y += dy;
        }
        invalidate();
      }
    }
    function up(e: PointerEvent) {
      if (gesture && !gesture.moved) callbacks.current.onSelect(gesture.node?.id ?? null);
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
      if (n?.path) callbacks.current.onOpen(n.path);
    }
    function key(e: KeyboardEvent) {
      if (e.key === '+' || e.key === '=') zoom(1.2, width / 2, height / 2);
      else if (e.key === '-') zoom(1 / 1.2, width / 2, height / 2);
      else if (e.key === '0') fitGraph();
      else if (e.key === 'Escape') callbacks.current.onSelect(null);
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
      invalidate();
    };
    canvas.addEventListener('pointerleave', leave);
    reduced.addEventListener('change', invalidate);
    const motionObserver = new MutationObserver(invalidate);
    motionObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-motion'],
    });
    // Canvas is idle when hidden; redraw when coming back into view.
    const visible = () => {
      invalidate();
    };
    document.addEventListener('visibilitychange', visible);
    return () => {
      cancelAnimationFrame(frame);
      invalidateRef.current = null;
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
  }, [model, style, fit]);
  return (
    <canvas
      ref={canvasRef}
      tabIndex={0}
      role="img"
      aria-label="Interactive knowledge graph. Drag nodes or the background. Scroll or pinch to zoom. Keyboard: plus and minus to zoom, zero to fit, Escape to clear. Use Browse files below for keyboard file navigation."
    />
  );
}
