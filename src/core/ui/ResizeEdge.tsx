import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { clampWidth } from '../settings/appearance';

/**
 * The edge between the page and the sidebar or side panel. Dragging it, or
 * the arrow keys when it has focus, changes the width; a double click puts
 * it back. The width shows as it changes and is saved once let go.
 */
export function ResizeEdge({
  label,
  grows,
  width,
  range,
  token,
  onChange,
}: {
  label: string;
  /** Which way to drag to make it wider. */
  grows: 'left' | 'right';
  width: number;
  range: { min: number; max: number; initial: number };
  /** The CSS custom property holding the width. */
  token: string;
  onChange: (width: number) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; width: number } | null>(null);
  const show = (w: number) => {
    document.documentElement.style.setProperty(token, `${String(w)}px`);
  };
  const widthAt = (x: number) => {
    const from = start.current;
    if (!from) return width;
    const dx = x - from.x;
    return clampWidth(from.width + (grows === 'right' ? dx : -dx), range);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = { x: e.clientX, width };
    setDragging(true);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (start.current) show(widthAt(e.clientX));
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (!start.current) return;
    const w = widthAt(e.clientX);
    start.current = null;
    setDragging(false);
    if (w !== width) onChange(w);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 64 : 16;
    const wider = grows === 'right' ? 'ArrowRight' : 'ArrowLeft';
    const narrower = grows === 'right' ? 'ArrowLeft' : 'ArrowRight';
    let next: number | null = null;
    if (e.key === wider) next = width + step;
    else if (e.key === narrower) next = width - step;
    else if (e.key === 'Home') next = range.initial;
    if (next === null) return;
    e.preventDefault();
    onChange(clampWidth(next, range));
  };

  return (
    <div
      className={dragging ? 'resize-edge dragging' : 'resize-edge'}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={width}
      aria-valuemin={range.min}
      aria-valuemax={range.max}
      tabIndex={0}
      title={`${label}. Double-click to reset.`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={() => {
        onChange(range.initial);
      }}
      onKeyDown={onKeyDown}
    />
  );
}
