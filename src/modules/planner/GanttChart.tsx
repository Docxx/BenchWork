import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import type { ScheduledItem } from '@core/api';
import {
  addDays,
  buildRows,
  colourOf,
  colourOrder,
  criticalPath,
  DAY_PX,
  daysBetween,
  span,
  type ColourBy,
  type GroupBy,
  type Row,
  type Zoom,
} from './gantt';

/** Row height and the width of the names down the left, in pixels. */
const ROW = 34;
const LABEL_W = 240;
/** A drag shorter than this, in pixels, is a click. */
const CLICK_PX = 4;
/** The width of the grip at each end of a bar, in pixels. */
const GRIP = 7;

export interface ChartOptions {
  zoom: Zoom;
  groupBy: GroupBy;
  colourBy: ColourBy;
  critical: boolean;
}

type DragMode = 'move' | 'start' | 'end';
interface Drag {
  key: string;
  mode: DragMode;
  x: number;
  dx: number;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2 Nov 2026" */
export function showDay(day: string): string {
  return `${String(Number(day.slice(8)))} ${MONTHS[Number(day.slice(5, 7)) - 1] ?? ''} ${day.slice(0, 4)}`;
}

/** Runs of days that share a label, such as a month, for the scale at the top. */
function runs(from: string, days: number, label: (day: string) => string) {
  const out: { label: string; start: number; length: number }[] = [];
  for (let i = 0; i < days; i += 1) {
    const l = label(addDays(from, i));
    const last = out.at(-1);
    if (last && last.label === l) last.length += 1;
    else out.push({ label: l, start: i, length: 1 });
  }
  return out;
}

/** The new dates of a bar dragged by `days` days. */
function draggedDates(item: ScheduledItem, mode: DragMode, days: number) {
  if (mode === 'move' || item.milestone) {
    return { start: addDays(item.start, days), end: addDays(item.end, days) };
  }
  if (mode === 'start') {
    const start = addDays(item.start, days);
    return { start: start > item.end ? item.end : start, end: item.end };
  }
  const end = addDays(item.end, days);
  return { start: item.start, end: end < item.start ? item.start : end };
}

/** One item's bar: dragged to move it, by its ends to change its length, or moved with arrow keys. */
function GanttBar({
  item,
  dates,
  left,
  px,
  colour,
  critical,
  dragging,
  onPointerDown,
  onMove,
  onOpen,
}: {
  item: ScheduledItem;
  /** Where it is drawn now, which differs from the item's own dates while dragged. */
  dates: { start: string; end: string };
  left: number;
  px: number;
  colour: string;
  critical: boolean;
  dragging: boolean;
  onPointerDown: (e: PointerEvent<HTMLElement>) => void;
  onMove: (item: ScheduledItem, start: string, end: string) => void;
  onOpen: (item: ScheduledItem) => void;
}) {
  const days = span(dates);
  const tip = [
    item.title,
    item.milestone
      ? showDay(dates.start)
      : `${showDay(dates.start)} to ${showDay(dates.end)} (${String(days)} ${days === 1 ? 'day' : 'days'})`,
    `${String(Math.round(item.progress * 100))}% done`,
    item.person === null ? '' : `For @${item.person}`,
  ]
    .filter((s) => s !== '')
    .join('\n');
  const classes = [
    'gantt-bar',
    item.milestone ? 'milestone' : '',
    item.summary === true ? 'summary' : '',
    item.done ? 'done' : '',
    critical ? 'critical' : '',
    dragging ? 'dragging' : '',
  ]
    .filter((c) => c !== '')
    .join(' ');
  return (
    <button
      type="button"
      className={classes}
      style={{
        left,
        width: item.milestone ? undefined : Math.max(px, days * px),
        ['--bar' as string]: `var(--section-${colour})`,
      }}
      title={tip}
      aria-label={`${item.title}, ${showDay(dates.start)}${item.milestone ? '' : ` to ${showDay(dates.end)}`}`}
      onPointerDown={onPointerDown}
      onKeyDown={(e) => {
        if (item.summary === true) return;
        const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (step === 0) return;
        e.preventDefault();
        const next = draggedDates(item, e.shiftKey ? 'end' : 'move', step);
        onMove(item, next.start, next.end);
      }}
      onClick={(e) => {
        // Keyboard Enter opens; pointer clicks are handled on release.
        if (e.detail === 0) onOpen(item);
      }}
    >
      {!item.milestone && (
        <span className="gantt-progress" style={{ width: `${String(item.progress * 100)}%` }} />
      )}
      <span className="gantt-bar-label">{item.title}</span>
    </button>
  );
}

/**
 * The chart: names down the left, a scale of days along the top, and a bar
 * for each item, with arrows from the items it waits for. Bars are dragged
 * to move them, or by their ends to change their length.
 */
export function GanttChart({
  items,
  options,
  from,
  to,
  today,
  onMove,
  onOpen,
}: {
  items: ScheduledItem[];
  options: ChartOptions;
  from: string;
  to: string;
  today: string;
  onMove: (item: ScheduledItem, start: string, end: string) => void;
  onOpen: (item: ScheduledItem) => void;
}) {
  const [folded, setFolded] = useState<Set<string>>(new Set());
  const [drag, setDrag] = useState<Drag | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const px = DAY_PX[options.zoom];
  const days = daysBetween(from, to) + 1;
  const width = days * px;

  const rows = useMemo(
    () => buildRows(items, options.groupBy, folded),
    [items, options.groupBy, folded],
  );
  const order = useMemo(() => colourOrder(items, options.colourBy), [items, options.colourBy]);
  const critical = useMemo(
    () => (options.critical ? criticalPath(items) : new Set<string>()),
    [items, options.critical],
  );
  const rowOf = new Map<string, number>();
  rows.forEach((r, i) => {
    if (r.kind === 'item') rowOf.set(r.item.key, i);
  });

  // Opens with today in view, and again when the zoom changes.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    el.scrollLeft = Math.max(0, daysBetween(from, today) * px - el.clientWidth / 3);
  }, [from, today, px]);

  // What a drag in progress needs when it ends, kept up to date.
  const latest = useRef({ items, px, onMove, onOpen });
  useEffect(() => {
    latest.current = { items, px, onMove, onOpen };
  });

  const datesOf = (item: ScheduledItem) =>
    drag !== null && drag.key === item.key
      ? draggedDates(item, drag.mode, Math.round(drag.dx / px))
      : { start: item.start, end: item.end };
  const xOf = (day: string) => daysBetween(from, day) * px;

  const top =
    options.zoom === 'quarter' || options.zoom === 'month'
      ? runs(from, days, (d) => d.slice(0, 4))
      : runs(from, days, (d) => `${MONTHS[Number(d.slice(5, 7)) - 1] ?? ''} ${d.slice(0, 4)}`);
  const bottom =
    options.zoom === 'day'
      ? runs(from, days, (d) => d)
      : options.zoom === 'week'
        ? runs(from, days, (d) => {
            // Weeks from Monday, named by their first day.
            const back = (new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7;
            return addDays(d, -back);
          })
        : runs(from, days, (d) => d.slice(0, 7));
  const bottomLabel = (label: string) =>
    options.zoom === 'day'
      ? String(Number(label.slice(8)))
      : options.zoom === 'week'
        ? `${String(Number(label.slice(8)))} ${MONTHS[Number(label.slice(5, 7)) - 1] ?? ''}`
        : options.zoom === 'month'
          ? (MONTHS[Number(label.slice(5, 7)) - 1] ?? '')
          : (MONTHS[Number(label.slice(5, 7)) - 1] ?? '').charAt(0);

  // Weekends shaded at day and week zoom, lined up with the first day shown.
  const weekendOffset = ((new Date(`${from}T12:00:00Z`).getUTCDay() + 1) % 7) * px;
  const trackStyle =
    options.zoom === 'day' || options.zoom === 'week'
      ? {
          backgroundImage: `linear-gradient(90deg, var(--gantt-weekend) 0 ${String(2 * px)}px, transparent ${String(2 * px)}px)`,
          backgroundSize: `${String(7 * px)}px 100%`,
          backgroundPosition: `${String(-weekendOffset)}px 0`,
        }
      : undefined;

  const startDrag = (e: PointerEvent<HTMLElement>, item: ScheduledItem) => {
    if (e.button !== 0) return;
    e.preventDefault();
    if (item.summary === true) {
      onOpen(item);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const mode: DragMode = item.milestone
      ? 'move'
      : e.clientX - rect.left < GRIP
        ? 'start'
        : rect.right - e.clientX < GRIP
          ? 'end'
          : 'move';
    const x = e.clientX;
    setDrag({ key: item.key, mode, x, dx: 0 });
    // The bar follows the pointer anywhere on the page until it is let go.
    const move = (ev: globalThis.PointerEvent) => {
      setDrag((d) => (d === null ? d : { ...d, dx: ev.clientX - x }));
    };
    const up = (ev: globalThis.PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setDrag(null);
      const now = latest.current;
      const dx = ev.clientX - x;
      if (Math.abs(dx) < CLICK_PX) {
        now.onOpen(item);
        return;
      }
      const shift = Math.round(dx / now.px);
      if (shift === 0) return;
      const next = draggedDates(item, mode, shift);
      now.onMove(item, next.start, next.end);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const arrows = items.flatMap((item) =>
    item.after.flatMap((k) => {
      const before = items.find((i) => i.key === k);
      const a = rowOf.get(k);
      const b = rowOf.get(item.key);
      if (!before || a === undefined || b === undefined) return [];
      const x1 = xOf(datesOf(before).end) + px;
      const y1 = a * ROW + ROW / 2;
      const x2 = xOf(datesOf(item).start);
      const y2 = b * ROW + ROW / 2;
      const bend = Math.max(x1 + 8, Math.min(x2 - 8, x1 + 14));
      const d =
        x2 - 8 >= x1 + 8
          ? `M${String(x1)},${String(y1)} H${String(bend)} V${String(y2)} H${String(x2)}`
          : `M${String(x1)},${String(y1)} H${String(x1 + 8)} V${String(y2 - ROW / 2 + 3)} H${String(x2 - 8)} V${String(y2)} H${String(x2)}`;
      const hot = critical.has(k) && critical.has(item.key);
      return [{ key: `${k}>${item.key}`, d, hot }];
    }),
  );

  const label = (row: Row) => {
    if (row.kind === 'group') {
      return (
        <div className="gantt-label gantt-group-label">
          {row.label} <span className="nav-count">{row.count}</span>
        </div>
      );
    }
    const { item, depth, hasParts } = row;
    return (
      <div className="gantt-label" style={{ paddingLeft: `${String(0.6 + depth * 1.1)}rem` }}>
        {hasParts ? (
          <button
            type="button"
            className="gantt-fold"
            aria-label={
              folded.has(item.key) ? `Show the parts of ${item.title}` : `Fold ${item.title}`
            }
            aria-expanded={!folded.has(item.key)}
            onClick={() => {
              setFolded((f) => {
                const next = new Set(f);
                if (next.has(item.key)) next.delete(item.key);
                else next.add(item.key);
                return next;
              });
            }}
          >
            {folded.has(item.key) ? '▸' : '▾'}
          </button>
        ) : (
          <span className="gantt-fold-space" />
        )}
        <button
          type="button"
          className="gantt-name"
          title={item.title}
          onClick={() => {
            onOpen(item);
          }}
        >
          {item.title}
        </button>
        {item.person !== null && <span className="gantt-person">@{item.person}</span>}
      </div>
    );
  };

  return (
    <div className="gantt" ref={scroller} role="region" aria-label="Chart">
      <div className="gantt-inner" style={{ width: `${String(LABEL_W + width)}px` }}>
        <div className="gantt-head">
          <div className="gantt-corner" />
          <div className="gantt-scale" style={{ width: `${String(width)}px` }}>
            <div className="gantt-scale-row">
              {top.map((r) => (
                <span
                  key={`${r.label}-${String(r.start)}`}
                  style={{ left: r.start * px, width: r.length * px }}
                >
                  {r.length * px > 40 ? r.label : ''}
                </span>
              ))}
            </div>
            <div className="gantt-scale-row">
              {bottom.map((r) => (
                <span
                  key={`${r.label}-${String(r.start)}`}
                  className={r.label === today ? 'today' : undefined}
                  style={{ left: r.start * px, width: r.length * px }}
                >
                  {r.length * px >= 14 ? bottomLabel(r.label) : ''}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="gantt-body" style={{ height: `${String(rows.length * ROW)}px` }}>
          {rows.map((row, i) => (
            <div
              key={row.kind === 'group' ? `group:${row.label}` : row.item.key}
              className={row.kind === 'group' ? 'gantt-row group' : 'gantt-row'}
              style={{ top: i * ROW, height: ROW }}
            >
              {label(row)}
              <div className="gantt-track" style={{ width: `${String(width)}px`, ...trackStyle }}>
                {row.kind === 'item' && (
                  <GanttBar
                    item={row.item}
                    dates={datesOf(row.item)}
                    left={xOf(datesOf(row.item).start)}
                    px={px}
                    colour={colourOf(row.item, options.colourBy, order)}
                    critical={critical.has(row.item.key)}
                    dragging={drag?.key === row.item.key}
                    onPointerDown={(e) => {
                      startDrag(e, row.item);
                    }}
                    onMove={onMove}
                    onOpen={onOpen}
                  />
                )}
              </div>
            </div>
          ))}
          <svg
            className="gantt-arrows"
            width={width}
            height={rows.length * ROW}
            style={{ left: LABEL_W }}
            aria-hidden="true"
          >
            <defs>
              <marker
                id="gantt-head"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto"
              >
                <path d="M0,0 L10,5 L0,10 z" fill="context-stroke" />
              </marker>
            </defs>
            {arrows.map((a) => (
              <path
                key={a.key}
                d={a.d}
                className={a.hot ? 'hot' : undefined}
                markerEnd="url(#gantt-head)"
              />
            ))}
          </svg>
          {today >= from && today <= to && (
            <div
              className="gantt-today"
              style={{ left: LABEL_W + xOf(today) + px / 2 }}
              title={`Today, ${showDay(today)}`}
            />
          )}
        </div>
      </div>
    </div>
  );
}
