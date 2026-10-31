import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ModuleContext, ScheduledItem } from '@core/api';
import { GanttChart, type ChartOptions } from './GanttChart';
import { cascade, chartRange, kindOf, type ColourBy, type GroupBy, type Zoom } from './gantt';

/** Pages are read again this long after they change. */
export const RELOAD_MS = 400;
const OPTIONS_FILE = 'chart.json';

const ZOOMS: { id: Zoom; label: string }[] = [
  { id: 'day', label: 'Days' },
  { id: 'week', label: 'Weeks' },
  { id: 'month', label: 'Months' },
  { id: 'quarter', label: 'Quarters' },
];
const GROUPS: { id: GroupBy; label: string }[] = [
  { id: 'none', label: 'Nothing' },
  { id: 'notebook', label: 'Notebook' },
  { id: 'person', label: 'Person' },
  { id: 'priority', label: 'Priority' },
  { id: 'kind', label: 'Tasks and pages' },
];
const COLOURINGS: { id: ColourBy; label: string }[] = [
  { id: 'notebook', label: 'Notebook' },
  { id: 'person', label: 'Person' },
  { id: 'priority', label: 'Priority' },
  { id: 'kind', label: 'Tasks and pages' },
  { id: 'progress', label: 'Progress' },
];

interface Saved extends ChartOptions {
  showTasks: boolean;
  showPages: boolean;
  hideDone: boolean;
}

const DEFAULTS: Saved = {
  zoom: 'week',
  groupBy: 'notebook',
  colourBy: 'notebook',
  critical: false,
  showTasks: true,
  showPages: true,
  hideDone: false,
};

function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * The plan as a chart: tasks with dates and pages with dates, from every
 * module that schedules things. Dragging a bar writes its new dates where
 * it is written, and moves on the items waiting for it.
 */
export function PlannerView({ ctx, notebook }: { ctx: ModuleContext; notebook: string | null }) {
  const [items, setItems] = useState<ScheduledItem[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [options, setOptions] = useState<Saved>(DEFAULTS);
  const [shown, setShown] = useState(notebook ?? '');
  const [reads, setReads] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let current = true;
    void ctx.storage
      .read<Partial<Saved>>(OPTIONS_FILE)
      .catch(() => null)
      .then((saved) => {
        if (current && saved) setOptions((o) => ({ ...o, ...saved }));
      });
    return () => {
      current = false;
    };
  }, [ctx]);

  const change = (changes: Partial<Saved>) => {
    setOptions((o) => {
      const next = { ...o, ...changes };
      void ctx.storage.write(OPTIONS_FILE, next).catch(() => undefined);
      return next;
    });
  };

  useEffect(() => {
    let current = true;
    ctx.app
      .scheduled()
      .then((found) => {
        if (current) setItems(found);
      })
      .catch((err: unknown) => {
        if (current) setProblem(err instanceof Error ? err.message : String(err));
      });
    return () => {
      current = false;
    };
  }, [ctx, reads]);

  // Read again a moment after pages change, or what is scheduled does, all at once.
  useEffect(() => {
    const later = () => {
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        setReads((n) => n + 1);
      }, RELOAD_MS);
    };
    const watching = ctx.vault.watch((c) => {
      if (c.paths.some((p) => p.toLowerCase().endsWith('.md'))) later();
    });
    const scheduling = ctx.app.watchScheduled(later);
    return () => {
      watching.dispose();
      scheduling.dispose();
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, [ctx]);

  const notebooks = useMemo(
    () => [...new Set((items ?? []).map((i) => i.notebook))].filter((n) => n !== '').sort(),
    [items],
  );
  const visible = useMemo(
    () =>
      (items ?? []).filter(
        (i) =>
          (shown === '' || i.notebook === shown) &&
          (options.showTasks || kindOf(i) !== 'Tasks') &&
          (options.showPages || kindOf(i) !== 'Pages') &&
          !(options.hideDone && i.done),
      ),
    [items, shown, options.showTasks, options.showPages, options.hideDone],
  );

  const onMove = useCallback(
    (item: ScheduledItem, start: string, end: string) => {
      if (items === null) return;
      const moves = cascade(items, item.key, start, end);
      // Drawn at once; written next, then read back.
      setItems(items.map((i) => ({ ...i, ...(moves.get(i.key) ?? {}) })));
      const others = moves.size - 1;
      setMessage(
        others > 0
          ? `${item.title} moved, and ${String(others)} ${others === 1 ? 'item that waits' : 'items that wait'} for it.`
          : null,
      );
      void (async () => {
        try {
          for (const [key, dates] of moves) await ctx.app.reschedule(key, dates.start, dates.end);
        } catch (err) {
          setMessage(`Not every date could be written. ${err instanceof Error ? err.message : ''}`);
        }
        setReads((n) => n + 1);
      })();
    },
    [ctx, items],
  );

  const onOpen = useCallback(
    (item: ScheduledItem) => {
      void ctx.app.open(item.path);
    },
    [ctx],
  );

  if (problem !== null) return <p className="notice">The plan could not be read. {problem}</p>;
  if (items === null) return <p className="hint">Reading the plan…</p>;

  const day = today();
  const range = chartRange(visible, day);

  return (
    <div className="planner">
      <div className="planner-controls">
        <div className="segmented" role="radiogroup" aria-label="Zoom">
          {ZOOMS.map((z) => (
            <button
              key={z.id}
              type="button"
              role="radio"
              aria-checked={options.zoom === z.id}
              onClick={() => {
                change({ zoom: z.id });
              }}
            >
              {z.label}
            </button>
          ))}
        </div>
        <label>
          Group by
          <select
            value={options.groupBy}
            onChange={(e) => {
              change({ groupBy: e.target.value as GroupBy });
            }}
          >
            {GROUPS.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Colour by
          <select
            value={options.colourBy}
            onChange={(e) => {
              change({ colourBy: e.target.value as ColourBy });
            }}
          >
            {COLOURINGS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Show
          <select
            value={shown}
            onChange={(e) => {
              setShown(e.target.value);
            }}
          >
            <option value="">All notebooks</option>
            {notebooks.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={options.showTasks}
            onChange={(e) => {
              change({ showTasks: e.target.checked });
            }}
          />
          Tasks
        </label>
        <label>
          <input
            type="checkbox"
            checked={options.showPages}
            onChange={(e) => {
              change({ showPages: e.target.checked });
            }}
          />
          Pages
        </label>
        <label>
          <input
            type="checkbox"
            checked={options.hideDone}
            onChange={(e) => {
              change({ hideDone: e.target.checked });
            }}
          />
          Hide done
        </label>
        <label>
          <input
            type="checkbox"
            checked={options.critical}
            onChange={(e) => {
              change({ critical: e.target.checked });
            }}
          />
          Critical path
        </label>
      </div>
      {message !== null && (
        <p className="hint" role="status">
          {message}
        </p>
      )}
      {visible.length === 0 ? (
        <p className="hint">
          Nothing to plan yet. Give tasks dates, such as 🛫 {day} 📅 {day}, or give pages a{' '}
          <code>start</code> and <code>end</code>, or a <code>date</code>.
        </p>
      ) : (
        <GanttChart
          // Starts afresh at a new zoom, so today comes back into view.
          key={options.zoom}
          items={visible}
          options={options}
          from={range.from}
          to={range.to}
          today={day}
          onMove={onMove}
          onOpen={onOpen}
        />
      )}
      <p className="hint">
        Drag a bar to move it, or its ends to change its length. Tasks wait for others with ⛔ and
        their 🆔; pages with <code>after: [[Other page]]</code>.
      </p>
    </div>
  );
}
