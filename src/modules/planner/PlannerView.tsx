import { useEffect, useMemo, useRef, useState } from 'react';
import type { ModuleContext } from '@core/api';
import type { GanttTask } from 'frappe-gantt';
import { formatDate, moveChanges, readPlan, type PlanTask } from './plan';

/** Writes wait this long after a bar stops moving. */
export const MOVE_SAVE_MS = 400;
/** Changes reported this soon after our own write are our own. */
const OWN_WRITE_MS = 2000;

const VIEW_MODES = [
  { id: 'Day', label: 'Days' },
  { id: 'Week', label: 'Weeks' },
  { id: 'Month', label: 'Months' },
];

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => `&#${String(c.charCodeAt(0))};`);

/** "23 Oct 2026", for the bar's details. */
function showDate(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y ?? 0, (m ?? 1) - 1, d ?? 1).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** Pages with dates on a timeline. Dragging a bar changes the page's dates. */
export function PlannerView({ ctx, notebook }: { ctx: ModuleContext; notebook: string | null }) {
  const [tasks, setTasks] = useState<PlanTask[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [shown, setShown] = useState<string>(notebook ?? '');
  const [mode, setMode] = useState('Week');
  const [reads, setReads] = useState(0);
  const chart = useRef<HTMLDivElement>(null);
  /** Moves waiting to be written, by page. */
  const pending = useRef(
    new Map<string, { timer: ReturnType<typeof setTimeout>; run: () => void }>(),
  );
  const lastWrite = useRef(0);

  useEffect(() => {
    let current = true;
    readPlan(ctx)
      .then((read) => {
        // Redrawn only when the plan itself changed, so the chart keeps its place.
        if (current) setTasks((old) => (JSON.stringify(old) === JSON.stringify(read) ? old : read));
      })
      .catch((err: unknown) => {
        if (current) setProblem(err instanceof Error ? err.message : String(err));
      });
    return () => {
      current = false;
    };
  }, [ctx, reads]);

  // Pages changed elsewhere are read again; our own moves are already drawn.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const watching = ctx.vault.watch((change) => {
      if (!change.paths.some((p) => p.toLowerCase().endsWith('.md'))) return;
      if (Date.now() - lastWrite.current < OWN_WRITE_MS) return;
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        setReads((n) => n + 1);
      }, 300);
    });
    return () => {
      if (timer !== null) clearTimeout(timer);
      watching.dispose();
    };
  }, [ctx]);

  // Moves still waiting are written when the view closes.
  useEffect(() => {
    const waiting = pending.current;
    return () => {
      for (const { timer, run } of [...waiting.values()]) {
        clearTimeout(timer);
        run();
      }
    };
  }, []);

  const notebooks = useMemo(
    () => [...new Set((tasks ?? []).map((t) => t.notebook))].filter((n) => n !== '').sort(),
    [tasks],
  );
  const visible = useMemo(
    () => (tasks ?? []).filter((t) => shown === '' || t.notebook === shown),
    [tasks, shown],
  );

  useEffect(() => {
    const element = chart.current;
    if (!element || visible.length === 0) return;
    let current = true;
    const ids = new Map(visible.map((t, i) => [t.path, `task-${String(i)}`]));
    const byId = new Map(visible.map((t, i) => [`task-${String(i)}`, t]));
    const ganttTasks: GanttTask[] = visible.map((t) => ({
      id: ids.get(t.path) ?? '',
      name: t.milestone ? `◆ ${t.title}` : t.title,
      start: t.start,
      end: t.end,
      progress: t.progress,
      dependencies: t.after.flatMap((p) => {
        const id = ids.get(p);
        return id === undefined ? [] : [id];
      }),
      ...(t.milestone ? { custom_class: 'milestone' } : {}),
    }));

    const write = (task: PlanTask, changes: Record<string, unknown>) => {
      const waiting = pending.current;
      const before = waiting.get(task.path);
      if (before !== undefined) clearTimeout(before.timer);
      const run = () => {
        waiting.delete(task.path);
        lastWrite.current = Date.now();
        ctx.app.setPageProperties(task.path, changes).catch((err: unknown) => {
          ctx.app.notify(
            `${task.title} could not be changed. ${err instanceof Error ? err.message : String(err)}`,
          );
        });
      };
      waiting.set(task.path, { timer: setTimeout(run, MOVE_SAVE_MS), run });
    };

    void Promise.all([import('frappe-gantt'), import('frappe-gantt/style.css')]).then(
      ([{ default: Gantt }]) => {
        if (!current) return;
        element.replaceChildren();
        new Gantt(element, ganttTasks, {
          view_mode: mode,
          language: 'en',
          today_button: true,
          view_mode_select: false,
          scroll_to: 'today',
          popup: (popup) => {
            const task = byId.get(popup.task.id);
            if (!task) return;
            popup.set_title(escapeHtml(task.title));
            popup.set_subtitle(escapeHtml(task.notebook));
            popup.set_details(
              task.start === task.end
                ? escapeHtml(showDate(task.start))
                : `${escapeHtml(showDate(task.start))} to ${escapeHtml(showDate(task.end))}`,
            );
          },
          on_double_click: (gt) => {
            const task = byId.get(gt.id);
            if (task) void ctx.app.open(task.path);
          },
          on_date_change: (gt, start, end) => {
            const task = byId.get(gt.id);
            if (!task) return;
            const from = formatDate(start);
            const to = task.milestone ? from : formatDate(end);
            const changes = moveChanges(task, from, to);
            write(task, changes);
            // Later moves build on this one.
            Object.assign(task, {
              start: from,
              end: to,
              singleDate: typeof changes['date'] === 'string',
            });
          },
          on_progress_change: (gt, progress) => {
            const task = byId.get(gt.id);
            if (task) write(task, { progress: Math.round(progress) });
          },
        });
      },
      (err: unknown) => {
        if (current) setProblem(err instanceof Error ? err.message : String(err));
      },
    );
    return () => {
      current = false;
    };
  }, [ctx, visible, mode]);

  if (problem !== null) return <p className="notice">The plan could not be shown. {problem}</p>;
  if (tasks === null) return <p className="hint">Reading the plan…</p>;

  return (
    <div className="planner">
      <div className="planner-controls">
        <label>
          Notebook
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
          Show
          <select
            value={mode}
            onChange={(e) => {
              setMode(e.target.value);
            }}
          >
            {VIEW_MODES.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <span className="hint">Drag a bar to change its dates. Double-click to open the page.</span>
      </div>
      {visible.length === 0 ? (
        <p className="page-empty">
          Nothing to plan yet. Give a page a start and end, or a date, in its properties to see it
          here.
        </p>
      ) : (
        <div ref={chart} className="planner-chart" aria-label="Timeline" role="figure" />
      )}
    </div>
  );
}
