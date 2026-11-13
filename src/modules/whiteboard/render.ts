import { boundsOf, wrapText, type BoardItem, type Box, type StrokeItem } from './model';

/** Where the view is: the board point at the top left, and the zoom. */
export interface View {
  x: number;
  y: number;
  zoom: number;
}

export const toScreen = (v: View, x: number, y: number): [number, number] => [
  (x - v.x) * v.zoom,
  (y - v.y) * v.zoom,
];
export const toBoard = (v: View, x: number, y: number): [number, number] => [
  x / v.zoom + v.x,
  y / v.zoom + v.y,
];

/** A view that shows a box with a margin, in a canvas of a size. */
export function viewToFit(box: Box | null, width: number, height: number): View {
  if (box === null || box.w + box.h === 0) return { x: -width / 2, y: -height / 2, zoom: 1 };
  const zoom = Math.max(
    0.05,
    Math.min(2, (width - 80) / (box.w || 1), (height - 80) / (box.h || 1)),
  );
  return {
    x: box.x + box.w / 2 - width / zoom / 2,
    y: box.y + box.h / 2 - height / zoom / 2,
    zoom,
  };
}

/** Dark ink reads light on a dark board, as pen ink does elsewhere in the app. */
export function inkColour(colour: string, dark: boolean): string {
  if (!dark) return colour;
  const r = parseInt(colour.slice(1, 3), 16),
    g = parseInt(colour.slice(3, 5), 16),
    b = parseInt(colour.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 < 70 ? '#e8ece9' : colour;
}

/**
 * Draws a stroke. A pen and a pencil thin and thicken with pressure, drawn
 * as short joined pieces; a pencil is grainier and lighter; a marker is
 * even and square-ended; a highlighter is wide and see-through.
 */
export function drawStroke(c: CanvasRenderingContext2D, s: StrokeItem, dark: boolean): void {
  const pts = s.points;
  const first = pts[0];
  if (!first) return;
  c.save();
  c.strokeStyle = c.fillStyle = inkColour(s.colour, dark);
  c.lineJoin = 'round';
  c.lineCap = s.pen === 'marker' || s.pen === 'highlighter' ? 'butt' : 'round';
  if (s.pen === 'highlighter') c.globalAlpha = 0.35;
  if (s.pen === 'pencil') c.globalAlpha = 0.7;
  if (pts.length === 1) {
    c.beginPath();
    c.arc(first[0], first[1], s.width / 2, 0, Math.PI * 2);
    c.fill();
    c.restore();
    return;
  }
  if (s.pen === 'marker' || s.pen === 'highlighter') {
    // One even line, so a see-through stroke does not darken where pieces meet.
    c.lineWidth = s.width;
    c.beginPath();
    c.moveTo(first[0], first[1]);
    for (let i = 1; i < pts.length - 1; i += 1) {
      const p = pts[i],
        n = pts[i + 1];
      if (p && n) c.quadraticCurveTo(p[0], p[1], (p[0] + n[0]) / 2, (p[1] + n[1]) / 2);
    }
    const last = pts.at(-1);
    if (last) c.lineTo(last[0], last[1]);
    c.stroke();
    c.restore();
    return;
  }
  for (let i = 1; i < pts.length; i += 1) {
    const a = pts[i - 1],
      b = pts[i];
    if (!a || !b) continue;
    const pressure = (a[2] + b[2]) / 2;
    c.lineWidth = Math.max(0.4, s.width * (0.35 + pressure * 1.3));
    c.beginPath();
    c.moveTo(a[0], a[1]);
    c.lineTo(b[0], b[1]);
    c.stroke();
  }
  c.restore();
}

function arrowHead(
  c: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  w: number,
) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const size = Math.max(8, w * 4);
  c.beginPath();
  c.moveTo(x2, y2);
  c.lineTo(x2 - size * Math.cos(angle - 0.45), y2 - size * Math.sin(angle - 0.45));
  c.lineTo(x2 - size * Math.cos(angle + 0.45), y2 - size * Math.sin(angle + 0.45));
  c.closePath();
  c.fill();
}

/** Black or white, whichever reads on a paper colour. */
function onPaper(colour: string): string {
  const r = parseInt(colour.slice(1, 3), 16),
    g = parseInt(colour.slice(3, 5), 16),
    b = parseInt(colour.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 140 ? '#1d2725' : '#f4f6f5';
}

export interface DrawOptions {
  dark: boolean;
  /** Images that have loaded, by vault path. */
  images: ReadonlyMap<string, HTMLImageElement>;
  /** An item being typed in, drawn without its text. */
  editing?: string | null;
  font: string;
}

/** Draws one item, in board coordinates. */
export function drawItem(c: CanvasRenderingContext2D, item: BoardItem, o: DrawOptions): void {
  switch (item.kind) {
    case 'stroke':
      drawStroke(c, item, o.dark);
      return;
    case 'shape': {
      c.save();
      c.strokeStyle = c.fillStyle = inkColour(item.colour, o.dark);
      c.lineWidth = item.width;
      c.lineJoin = 'round';
      c.lineCap = 'round';
      const b = boundsOf(item);
      if (item.shape === 'rect' || item.shape === 'ellipse') {
        c.beginPath();
        if (item.shape === 'rect') c.roundRect(b.x, b.y, b.w, b.h, Math.min(6, b.w / 4, b.h / 4));
        else c.ellipse(b.x + b.w / 2, b.y + b.h / 2, b.w / 2, b.h / 2, 0, 0, Math.PI * 2);
        if (item.fill !== null) {
          c.save();
          c.fillStyle = item.fill;
          c.globalAlpha = 0.85;
          c.fill();
          c.restore();
        }
        c.stroke();
      } else {
        c.beginPath();
        c.moveTo(item.x1, item.y1);
        c.lineTo(item.x2, item.y2);
        c.stroke();
        if (item.shape === 'arrow') arrowHead(c, item.x1, item.y1, item.x2, item.y2, item.width);
      }
      c.restore();
      return;
    }
    case 'text': {
      if (o.editing === item.id) return;
      c.save();
      c.fillStyle = inkColour(item.colour, o.dark);
      c.font = `${String(item.size)}px ${o.font}`;
      c.textBaseline = 'top';
      wrapText(item.text, item.w, item.size).forEach((line, i) => {
        c.fillText(line, item.x, item.y + i * item.size * 1.3);
      });
      c.restore();
      return;
    }
    case 'note': {
      c.save();
      c.shadowColor = 'rgb(0 0 0 / 0.25)';
      c.shadowBlur = 8;
      c.shadowOffsetY = 2;
      c.fillStyle = item.colour;
      c.beginPath();
      c.roundRect(item.x, item.y, item.w, item.h, 4);
      c.fill();
      c.shadowColor = 'transparent';
      if (o.editing !== item.id) {
        const size = 15;
        c.fillStyle = onPaper(item.colour);
        c.font = `${String(size)}px ${o.font}`;
        c.textBaseline = 'top';
        const lines = wrapText(item.text, item.w - 20, size);
        const room = Math.floor((item.h - 20) / (size * 1.3));
        lines.slice(0, room).forEach((line, i) => {
          c.fillText(line, item.x + 10, item.y + 10 + i * size * 1.3);
        });
      }
      c.restore();
      return;
    }
    case 'image': {
      const image = o.images.get(item.path);
      if (image) {
        c.drawImage(image, item.x, item.y, item.w, item.h);
      } else {
        c.save();
        c.strokeStyle = 'rgb(127 127 127 / 0.6)';
        c.setLineDash([6, 4]);
        c.strokeRect(item.x, item.y, item.w, item.h);
        c.restore();
      }
      return;
    }
  }
}

/** Draws the items that show in the view, back to front. */
export function drawBoard(
  c: CanvasRenderingContext2D,
  items: readonly BoardItem[],
  view: View,
  width: number,
  height: number,
  o: DrawOptions,
): void {
  const [left, top] = toBoard(view, 0, 0);
  const [right, bottom] = toBoard(view, width, height);
  c.save();
  c.scale(view.zoom, view.zoom);
  c.translate(-view.x, -view.y);
  for (const item of items) {
    const b = boundsOf(item);
    if (b.x > right || b.y > bottom || b.x + b.w < left || b.y + b.h < top) continue;
    drawItem(c, item, o);
  }
  c.restore();
}

/** Faint dots, so an endless board has something to move against. */
export function drawDots(
  c: CanvasRenderingContext2D,
  view: View,
  width: number,
  height: number,
  colour: string,
): void {
  let gap = 24;
  while (gap * view.zoom < 14) gap *= 2;
  const [left, top] = toBoard(view, 0, 0);
  const [right, bottom] = toBoard(view, width, height);
  c.save();
  c.fillStyle = colour;
  for (let x = Math.floor(left / gap) * gap; x < right; x += gap) {
    for (let y = Math.floor(top / gap) * gap; y < bottom; y += gap) {
      const [sx, sy] = toScreen(view, x, y);
      c.fillRect(sx - 0.75, sy - 0.75, 1.5, 1.5);
    }
  }
  c.restore();
}
