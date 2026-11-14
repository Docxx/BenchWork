import type { Box } from './model';
import type { Prim } from './scene';

/**
 * Lines, arrows, brackets and boxes, placed anywhere on the page. A shape
 * fills its part's box: a line runs across it, down it, or corner to
 * corner, so it is moved and resized like any other part.
 */

export const SHAPE_FORMS = ['line', 'arrow', 'bracket', 'box'] as const;
export type ShapeForm = (typeof SHAPE_FORMS)[number];

/** Across the middle, down the middle, falling to the right, or rising to the right. */
export const SHAPE_WAYS = ['across', 'down', 'fall', 'rise'] as const;
export type ShapeWay = (typeof SHAPE_WAYS)[number];

export interface Shape {
  form: ShapeForm;
  way: ShapeWay;
  colour: string;
  /** Line thickness, mm. */
  width: number;
  dashed: boolean;
  /** An arrow with heads at both ends. */
  both: boolean;
  /** An arrow pointing back, or a bracket's ends turned the other way. */
  flip: boolean;
}

export function newShape(form: ShapeForm = 'line'): Shape {
  return {
    form,
    way: 'across',
    colour: '#000000',
    width: 0.25,
    dashed: false,
    both: false,
    flip: false,
  };
}

/** Where a shape's line runs in its box. */
export function ends(shape: Shape, b: Box): [[number, number], [number, number]] {
  switch (shape.way) {
    case 'across':
      return [
        [b.x, b.y + b.h / 2],
        [b.x + b.w, b.y + b.h / 2],
      ];
    case 'down':
      return [
        [b.x + b.w / 2, b.y],
        [b.x + b.w / 2, b.y + b.h],
      ];
    case 'fall':
      return [
        [b.x, b.y],
        [b.x + b.w, b.y + b.h],
      ];
    case 'rise':
      return [
        [b.x, b.y + b.h],
        [b.x + b.w, b.y],
      ];
  }
}

/** A filled arrowhead with its point at `tip`, pointing away from `from`. */
function head(tip: [number, number], from: [number, number], size: number, colour: string): Prim {
  const dx = tip[0] - from[0];
  const dy = tip[1] - from[1];
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const back: [number, number] = [tip[0] - ux * size, tip[1] - uy * size];
  return {
    kind: 'poly',
    points: [
      tip,
      [back[0] - uy * size * 0.42, back[1] + ux * size * 0.42],
      [tip[0] - ux * size * 0.75, tip[1] - uy * size * 0.75],
      [back[0] + uy * size * 0.42, back[1] - ux * size * 0.42],
    ],
    fill: colour,
  };
}

export function shapePrims(shape: Shape, box: Box): Prim[] {
  const stroke = shape.colour;
  const width = shape.width;
  if (shape.form === 'box') {
    return [{ kind: 'rect', box, stroke, width, dash: shape.dashed }];
  }
  let [a, b] = ends(shape, box);
  if (shape.form === 'arrow' && shape.flip) [a, b] = [b, a];
  const prims: Prim[] = [];
  if (shape.form === 'arrow') {
    const size = Math.max(1.2, width * 6);
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    // The line stops inside the head, so its end does not show past the point.
    const inset = (end: [number, number], toward: [number, number]): [number, number] => [
      end[0] + ((toward[0] - end[0]) / len) * size * 0.7,
      end[1] + ((toward[1] - end[1]) / len) * size * 0.7,
    ];
    prims.push({
      kind: 'line',
      from: shape.both ? inset(a, b) : a,
      to: inset(b, a),
      stroke,
      width,
      dash: shape.dashed,
    });
    prims.push(head(b, a, size, stroke));
    if (shape.both) prims.push(head(a, b, size, stroke));
    return prims;
  }
  prims.push({ kind: 'line', from: a, to: b, stroke, width, dash: shape.dashed });
  if (shape.form === 'bracket') {
    // Short ends at right angles, down (or left) unless turned the other way.
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    const tick = Math.min(1.5, len / 4);
    const sign = shape.flip ? -1 : 1;
    const nx = (-dy / len) * tick * sign;
    const ny = (dx / len) * tick * sign;
    for (const p of [a, b])
      prims.push({ kind: 'line', from: p, to: [p[0] + nx, p[1] + ny], stroke, width });
  }
  return prims;
}

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function parseShape(raw: unknown): Shape {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    form: SHAPE_FORMS.find((f) => f === r['form']) ?? 'line',
    way: SHAPE_WAYS.find((w) => w === r['way']) ?? 'across',
    colour:
      typeof r['colour'] === 'string' && /^#[0-9a-f]{6}$/i.test(r['colour'])
        ? r['colour']
        : '#000000',
    width: num(r['width']) ? Math.min(3, Math.max(0.05, r['width'])) : 0.25,
    dashed: r['dashed'] === true,
    both: r['both'] === true,
    flip: r['flip'] === true,
  };
}
