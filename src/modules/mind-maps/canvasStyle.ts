import type { CSSProperties } from 'react';
import type { CanvasItem, CanvasLink } from './canvasFile';

/**
 * How cards and arrows look. Each choice is a key on the item or link in
 * the `.canvas.json` file, left out while it is the usual look, so plain
 * canvases stay as they were. Colours are names, drawn in the theme's own
 * section colours, so they suit light and dark.
 *
 *   card:  fill, borderColour, border, shape, textSize, link
 *   arrow: colour, line, width, ends, path, fromSide, toSide
 */

export const COLOURS = [
  'red',
  'orange',
  'yellow',
  'green',
  'teal',
  'blue',
  'purple',
  'grey',
] as const;
export type Colour = (typeof COLOURS)[number];

export const SHAPES = ['rounded', 'rectangle', 'pill', 'ellipse', 'diamond'] as const;
export const BORDERS = ['solid', 'dashed', 'dotted', 'none'] as const;
export const TEXT_SIZES = ['small', 'normal', 'large', 'huge'] as const;
export const LINES = ['solid', 'dashed', 'dotted'] as const;
export const WIDTHS = ['thin', 'medium', 'thick'] as const;
export const ENDS = ['end', 'both', 'start', 'none'] as const;
export const PATHS = ['curved', 'straight', 'step', 'smooth'] as const;
export const SIDES = ['top', 'right', 'bottom', 'left'] as const;

export type Shape = (typeof SHAPES)[number];
export type Border = (typeof BORDERS)[number];
export type TextSize = (typeof TEXT_SIZES)[number];
export type Line = (typeof LINES)[number];
export type Width = (typeof WIDTHS)[number];
export type Ends = (typeof ENDS)[number];
export type PathKind = (typeof PATHS)[number];
export type Side = (typeof SIDES)[number];

export interface CardLook {
  fill: Colour | null;
  borderColour: Colour | null;
  border: Border;
  shape: Shape;
  textSize: TextSize;
  /** A page or web address the card opens. */
  link: string | null;
}

export interface ArrowLook {
  colour: Colour | null;
  line: Line;
  width: Width;
  ends: Ends;
  path: PathKind;
  /** The sides it joins, when drawn between chosen dots; otherwise the facing sides. */
  fromSide: Side | null;
  toSide: Side | null;
}

export const CARD_DEFAULTS: CardLook = {
  fill: null,
  borderColour: null,
  border: 'solid',
  shape: 'rounded',
  textSize: 'normal',
  link: null,
};

export const ARROW_DEFAULTS: ArrowLook = {
  colour: null,
  line: 'solid',
  width: 'medium',
  ends: 'end',
  path: 'curved',
  fromSide: null,
  toSide: null,
};

function pick<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  return typeof value === 'string' && (options as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function colour(value: unknown): Colour | null {
  return typeof value === 'string' && (COLOURS as readonly string[]).includes(value)
    ? (value as Colour)
    : null;
}

function side(value: unknown): Side | null {
  return typeof value === 'string' && (SIDES as readonly string[]).includes(value)
    ? (value as Side)
    : null;
}

/** A card's look, with anything unknown read as the usual look. */
export function cardLook(item: CanvasItem): CardLook {
  return {
    fill: colour(item['fill']),
    borderColour: colour(item['borderColour']),
    border: pick(item['border'], BORDERS, 'solid'),
    shape: pick(item['shape'], SHAPES, 'rounded'),
    textSize: pick(item['textSize'], TEXT_SIZES, 'normal'),
    link: typeof item['link'] === 'string' && item['link'].trim() !== '' ? item['link'] : null,
  };
}

export function arrowLook(link: CanvasLink): ArrowLook {
  return {
    colour: colour(link['colour']),
    line: pick(link['line'], LINES, 'solid'),
    width: pick(link['width'], WIDTHS, 'medium'),
    ends: pick(link['ends'], ENDS, 'end'),
    path: pick(link['path'], PATHS, 'curved'),
    fromSide: side(link['fromSide']),
    toSide: side(link['toSide']),
  };
}

/**
 * `target` with `changes` made: a choice set back to the usual look is
 * removed from the file rather than written out.
 */
export function withLook<T extends Record<string, unknown>, L extends object>(
  target: T,
  changes: Partial<L>,
  defaults: L,
): T {
  const next: Record<string, unknown> = { ...target };
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined) continue;
    if (value === null || value === (defaults as Record<string, unknown>)[key]) {
      next[key] = undefined;
    } else {
      next[key] = value;
    }
  }
  return Object.fromEntries(Object.entries(next).filter(([, v]) => v !== undefined)) as T;
}

export const colourVar = (c: Colour): string => `var(--section-${c})`;

const TEXT_SCALE: Record<TextSize, string> = {
  small: '0.75rem',
  normal: '0.85rem',
  large: '1.05rem',
  huge: '1.5rem',
};

/** The card's own colours and size, as inline style; shape and border go in its class. */
export function cardStyle(look: CardLook): CSSProperties {
  const style: CSSProperties & Record<`--${string}`, string> = {
    fontSize: TEXT_SCALE[look.textSize],
  };
  if (look.fill !== null) {
    style['--card-fill'] = `color-mix(in srgb, ${colourVar(look.fill)} 24%, var(--surface))`;
  }
  if (look.borderColour !== null) style['--card-border'] = colourVar(look.borderColour);
  return style;
}

export function cardClass(look: CardLook, kind: string): string {
  return [
    'canvas-card',
    kind,
    `shape-${look.shape}`,
    `border-${look.border}`,
    look.fill === null ? '' : 'filled',
  ]
    .filter((c) => c !== '')
    .join(' ');
}

const STROKE: Record<Width, number> = { thin: 1, medium: 2, thick: 4 };
const DASHES: Record<Line, string | undefined> = {
  solid: undefined,
  dashed: '8 5',
  dotted: '1 5',
};
const EDGE_TYPES: Record<PathKind, string> = {
  curved: 'default',
  straight: 'straight',
  step: 'step',
  smooth: 'smoothstep',
};

/** What React Flow needs to draw an arrow this way. */
export function edgeLook(look: ArrowLook): {
  type: string;
  style: CSSProperties;
  head: boolean;
  tail: boolean;
  colour: string | undefined;
} {
  const colourCss = look.colour === null ? undefined : colourVar(look.colour);
  return {
    type: EDGE_TYPES[look.path],
    style: {
      strokeWidth: STROKE[look.width],
      ...(DASHES[look.line] === undefined ? {} : { strokeDasharray: DASHES[look.line] }),
      ...(look.line === 'dotted' ? { strokeLinecap: 'round' as const } : {}),
      ...(colourCss === undefined ? {} : { stroke: colourCss }),
    },
    head: look.ends === 'end' || look.ends === 'both',
    tail: look.ends === 'start' || look.ends === 'both',
    colour: colourCss,
  };
}
