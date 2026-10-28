import { createElement } from 'react';
import { LassoSelect } from 'lucide-react';
import { defineModule, type InkStroke, type InkToolArea, type InkToolPoint } from '@core/api';
import {
  boxOf,
  inBox,
  moveStrokes,
  recolourStrokes,
  strokesInLoop,
  withoutStrokes,
  type Box,
} from './lasso';
import { isScribble, scribbledOver } from './scratchOut';
import { snapShape } from './shapes';
import './handwriting.css';

/**
 * The Handwriting module, on top of the core's pen writing:
 * - a lasso, beside the pen, highlighter and eraser: draw a loop round
 *   strokes to choose them, then drag to move them, or recolour or delete
 *   them with the buttons that appear;
 * - shapes: hold the pen still at the end of a stroke to make it a
 *   straight line, rectangle or ellipse;
 * - scratching out: scribble back and forth over strokes to erase them.
 * Both only change strokes, which are saved as usual; switched off, every
 * drawing stays as it is.
 */

const COLOURS = [
  { name: 'Ink', value: '#1d2725' },
  { name: 'Blue', value: '#2f5fb3' },
  { name: 'Red', value: '#c0392b' },
  { name: 'Green', value: '#2e7d4f' },
  { name: 'Purple', value: '#7d5ba6' },
  { name: 'Orange', value: '#d9822b' },
] as const;

/** What the lasso is doing on one drawing. */
interface LassoState {
  phase: 'drawing' | 'chosen' | 'moving';
  loop: InkToolPoint[];
  chosen: Set<string>;
  from: InkToolPoint;
  /** The strokes as they were when a move began. */
  before: readonly InkStroke[];
  actions: HTMLElement | null;
}

const lassos = new WeakMap<InkToolArea, LassoState>();

function accent(area: InkToolArea): string {
  return getComputedStyle(area.element).getPropertyValue('--accent').trim() || '#5b8a76';
}

function drawLoop(area: InkToolArea, loop: readonly InkToolPoint[]): void {
  const first = loop[0];
  if (!first) return;
  const c = area.overlay;
  area.clearOverlay();
  c.save();
  c.strokeStyle = accent(area);
  c.lineWidth = 1.5;
  c.setLineDash([6, 4]);
  c.beginPath();
  c.moveTo(first.x, first.y);
  for (const p of loop) c.lineTo(p.x, p.y);
  c.stroke();
  c.restore();
}

function drawBox(area: InkToolArea, box: Box | null): void {
  area.clearOverlay();
  if (!box) return;
  const c = area.overlay;
  c.save();
  c.strokeStyle = accent(area);
  c.fillStyle = accent(area);
  c.lineWidth = 1.5;
  c.setLineDash([6, 4]);
  c.globalAlpha = 0.08;
  c.fillRect(box.x, box.y, box.w, box.h);
  c.globalAlpha = 1;
  c.strokeRect(box.x, box.y, box.w, box.h);
  c.restore();
}

function putAway(area: InkToolArea, state: LassoState): void {
  state.actions?.remove();
  state.actions = null;
  state.chosen = new Set();
  area.clearOverlay();
}

/** Buttons beside the chosen strokes: colours, and delete. */
function showActions(area: InkToolArea, state: LassoState): void {
  state.actions?.remove();
  const box = boxOf(area.strokes(), state.chosen);
  if (!box) return;
  const bar = document.createElement('span');
  bar.className = 'lasso-actions';
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', 'Chosen strokes');
  bar.style.left = `${String(Math.max(0, box.x))}px`;
  bar.style.top = `${String(Math.max(0, box.y + box.h + 6))}px`;
  // The drawing would take a press on these as the pen starting again.
  bar.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
  });
  const button = (label: string, onPress: () => void, colour?: string) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.title = label;
    b.setAttribute('aria-label', label);
    if (colour) {
      b.className = 'lasso-colour';
      b.style.background = colour;
    } else {
      b.className = 'lasso-delete';
      b.textContent = 'Delete';
    }
    b.addEventListener('click', (e) => {
      e.preventDefault();
      onPress();
    });
    bar.append(b);
  };
  for (const c of COLOURS) {
    button(
      c.name,
      () => {
        area.setStrokes(recolourStrokes(area.strokes(), state.chosen, c.value));
      },
      c.value,
    );
  }
  button('Delete', () => {
    area.setStrokes(withoutStrokes(area.strokes(), state.chosen));
    putAway(area, state);
  });
  area.element.append(bar);
  state.actions = bar;
}

export default defineModule({
  activate(ctx) {
    ctx.ink.registerStrokeFilter({
      id: 'handwriting.scratch-out',
      filter: (stroke, info) => {
        if (info.held || !isScribble(stroke.points)) return stroke;
        const under = scribbledOver(stroke, info.others);
        if (under.length === 0) return stroke;
        info.erase(under);
        return null;
      },
    });
    ctx.ink.registerStrokeFilter({
      id: 'handwriting.shapes',
      filter: (stroke, { held }) => (held ? (snapShape(stroke) ?? stroke) : stroke),
    });

    ctx.ink.registerTool({
      id: 'handwriting.lasso',
      title: 'Lasso: choose strokes to move, recolour or delete',
      icon: createElement(LassoSelect, { size: 17, strokeWidth: 1.8, 'aria-hidden': true }),
      down(area, point) {
        const state = lassos.get(area);
        if (
          state &&
          state.chosen.size > 0 &&
          inBox(boxOf(area.strokes(), state.chosen), point.x, point.y)
        ) {
          state.phase = 'moving';
          state.from = point;
          state.before = area.strokes();
          state.actions?.remove();
          state.actions = null;
          return;
        }
        if (state) putAway(area, state);
        lassos.set(area, {
          phase: 'drawing',
          loop: [point],
          chosen: new Set(),
          from: point,
          before: [],
          actions: null,
        });
      },
      move(area, point) {
        const state = lassos.get(area);
        if (!state) return;
        if (state.phase === 'drawing') {
          state.loop.push(point);
          drawLoop(area, state.loop);
        } else if (state.phase === 'moving') {
          const moved = moveStrokes(
            state.before,
            state.chosen,
            point.x - state.from.x,
            point.y - state.from.y,
          );
          area.previewStrokes(moved);
          drawBox(area, boxOf(moved, state.chosen));
        }
      },
      up(area, point) {
        const state = lassos.get(area);
        if (!state) return;
        if (state.phase === 'moving') {
          const dx = point.x - state.from.x;
          const dy = point.y - state.from.y;
          if (dx !== 0 || dy !== 0)
            area.setStrokes(moveStrokes(state.before, state.chosen, dx, dy));
        } else if (state.phase === 'drawing') {
          state.loop.push(point);
          state.chosen = strokesInLoop(area.strokes(), state.loop);
        }
        if (state.chosen.size === 0) {
          putAway(area, state);
          return;
        }
        state.phase = 'chosen';
        drawBox(area, boxOf(area.strokes(), state.chosen));
        showActions(area, state);
      },
      end(area) {
        const state = lassos.get(area);
        if (state) putAway(area, state);
        lassos.delete(area);
      },
    });
  },
});
