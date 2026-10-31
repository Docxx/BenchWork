import { EyeOff, Move, Plus } from 'lucide-react';
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  COLUMNS,
  compact,
  fillGrid,
  GAP_PX,
  placeCard,
  readingOrder,
  ROW_PX,
  startSize,
  type Grid,
} from '../settings/homeGrid';
import { homeWidgets } from '../settings/layout';
import { orderCards } from '../state/homeSlice';
import { useApp } from './AppStoreContext';
import { Menu } from './Menu';
import { ViewBoundary } from './ModuleView';
import { SidePanelToggle } from './PageView';
import { vaultName } from './Sidebar';
import { useHomeLayout, useWidgets } from './widgets';

/** Narrower than this, cards are stacked one above another. */
const STACK_QUERY = '(max-width: 760px)';

/** "Good morning" and so on, by the hour. */
export function greeting(now: Date): string {
  const hour = now.getHours();
  if (hour < 5) return 'Good evening';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/** Whether the window is narrow enough to stack the cards. */
function useStacked(): boolean {
  const [stacked, setStacked] = useState(
    () => typeof window.matchMedia === 'function' && window.matchMedia(STACK_QUERY).matches,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(STACK_QUERY);
    const onChange = (e: MediaQueryListEvent) => {
      setStacked(e.matches);
    };
    query.addEventListener('change', onChange);
    return () => {
      query.removeEventListener('change', onChange);
    };
  }, []);
  return stacked;
}

/**
 * Home: what BenchWork shows when nothing else is open. Its cards are
 * widgets, from the app and from modules, on a grid. In Edit home they are
 * dragged by their heading and resized from their corner; Done locks them.
 * Saved per vault, on this device.
 */
export function HomeView() {
  const status = useApp((s) => s.status);
  const layout = useHomeLayout();
  const setLayout = useApp((s) => s.setHomeLayout);
  const addToHome = useApp((s) => s.addToHome);
  const widgets = useWidgets();
  const stacked = useStacked();
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState<{ x: number; y: number } | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [preview, setPreview] = useState<Grid | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const now = new Date();

  const byId = new Map(widgets.map((w) => [w.id, w]));
  const order = orderCards(homeWidgets(widgets, layout.added), layout);
  const shown = order.filter((id) => !layout.hidden.includes(id));
  const hidden = order.filter((id) => layout.hidden.includes(id));
  const addable = widgets.filter((w) => !order.includes(w.id));
  const grid =
    preview ?? fillGrid(layout.grid, shown, (id) => startSize(id, byId.get(id)?.wide === true));
  const cards = readingOrder(grid).filter((id) => byId.has(id));
  const placed = !stacked;

  const save = (next: Grid) => {
    void setLayout({ grid: next, order: [...readingOrder(next), ...hidden] });
  };

  /** Pixels for a grid cell, from the grid's width now. */
  const cellSize = () => {
    const width = gridRef.current?.getBoundingClientRect().width ?? 1200;
    return { col: (width + GAP_PX) / COLUMNS, row: ROW_PX + GAP_PX };
  };

  const startDrag = (e: ReactPointerEvent, id: string, mode: 'move' | 'size') => {
    const from = grid[id];
    if (!editing || !placed || !from || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    setMoving(id);
    const x = e.clientX;
    const y = e.clientY;
    const base = grid;
    let latest = base;
    const move = (ev: PointerEvent) => {
      const { col, row } = cellSize();
      const dx = Math.round((ev.clientX - x) / col);
      const dy = Math.round((ev.clientY - y) / row);
      const cell =
        mode === 'move'
          ? { ...from, x: from.x + dx, y: from.y + dy }
          : { ...from, w: from.w + dx, h: from.h + dy };
      latest = placeCard(base, id, cell);
      setPreview(latest);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setMoving(null);
      setPreview(null);
      // Let go, every card settles as high as it can.
      if (latest !== base) save(compact(latest));
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  /** Arrow keys move a card a cell at a time; with Shift they resize it. */
  const onKey = (e: KeyboardEvent, id: string) => {
    const cell = grid[id];
    if (!cell) return;
    const dx = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    const dy = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
    if (dx === 0 && dy === 0) return;
    e.preventDefault();
    save(
      compact(
        placeCard(
          grid,
          id,
          e.shiftKey
            ? { ...cell, w: cell.w + dx, h: cell.h + dy }
            : { ...cell, x: cell.x + dx, y: cell.y + dy },
        ),
      ),
    );
  };

  return (
    <article className="home" aria-label="Home">
      <header className="home-header" data-window-drag>
        <div>
          <h1>{greeting(now)}</h1>
          <p className="home-date">
            {now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
            {status.kind === 'open' && <span> · {vaultName(status.vault.root)}</span>}
          </p>
        </div>
        <span className="home-header-tools">
          <button
            type="button"
            className={editing ? 'home-edit-done' : 'quiet'}
            aria-pressed={editing}
            onClick={() => {
              setEditing((e) => !e);
            }}
          >
            {editing ? 'Done' : 'Edit home'}
          </button>
          <SidePanelToggle />
        </span>
      </header>

      {editing && (
        <div className="home-hidden" aria-label="Hidden cards">
          <span className="home-edit-hint">
            {placed
              ? 'Drag a card by its heading to move it, or by its corner to resize it.'
              : 'Cards stack on a narrow screen; widen the window to arrange them.'}
          </span>
          <button
            type="button"
            className="chip"
            disabled={addable.length === 0}
            onClick={(e) => {
              setAdding({ x: e.clientX, y: e.clientY });
            }}
          >
            <Plus size={14} strokeWidth={2} aria-hidden />
            Add a card
          </button>
          {hidden.length > 0 && <span>Hidden:</span>}
          {hidden.map((id) => (
            <button
              key={id}
              type="button"
              className="chip"
              onClick={() => void setLayout({ hidden: layout.hidden.filter((h) => h !== id) })}
            >
              <Plus size={14} strokeWidth={2} aria-hidden />
              {byId.get(id)?.title ?? id}
            </button>
          ))}
        </div>
      )}
      {adding !== null && (
        <Menu
          label="Add a card"
          x={adding.x}
          y={adding.y}
          items={addable.map((w) => ({ label: w.title, onSelect: () => void addToHome(w.id) }))}
          onClose={() => {
            setAdding(null);
          }}
        />
      )}

      <div
        ref={gridRef}
        className={['home-grid', placed ? 'placed' : 'stacked', editing && placed ? 'editing' : '']
          .filter((c) => c !== '')
          .join(' ')}
      >
        {cards.map((id) => {
          const card = byId.get(id);
          const cell = grid[id];
          if (!card || !cell) return null;
          const headingId = `home-card-${id.replace(/[^a-z0-9]/gi, '-')}`;
          return (
            <section
              key={id}
              className={moving === id ? 'home-card moving' : 'home-card'}
              aria-labelledby={headingId}
              style={
                placed
                  ? {
                      gridColumn: `${String(cell.x + 1)} / span ${String(cell.w)}`,
                      gridRow: `${String(cell.y + 1)} / span ${String(cell.h)}`,
                    }
                  : undefined
              }
            >
              <header
                className="home-card-head"
                onPointerDown={(e) => {
                  if (!(e.target instanceof Element) || !e.target.closest('button')) {
                    startDrag(e, id, 'move');
                  }
                }}
              >
                {card.icon}
                <h2 id={headingId}>{card.title}</h2>
                {editing && (
                  <span className="home-card-tools">
                    {placed && (
                      <button
                        type="button"
                        className="icon-button home-card-grip"
                        aria-label={`Move ${card.title}`}
                        title="Drag to move, or use the arrow keys; with Shift they resize"
                        onPointerDown={(e) => {
                          startDrag(e, id, 'move');
                        }}
                        onKeyDown={(e) => {
                          onKey(e, id);
                        }}
                      >
                        <Move size={15} strokeWidth={1.75} aria-hidden />
                      </button>
                    )}
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Hide ${card.title}`}
                      title="Hide"
                      onClick={() => void setLayout({ hidden: [...layout.hidden, id] })}
                    >
                      <EyeOff size={15} strokeWidth={1.75} aria-hidden />
                    </button>
                  </span>
                )}
              </header>
              <div className="home-card-body">
                {card.moduleId === null ? (
                  card.render(null)
                ) : (
                  <ViewBoundary moduleId={card.moduleId}>{card.render(null)}</ViewBoundary>
                )}
              </div>
              {editing && placed && (
                <span
                  className="home-card-resize"
                  role="presentation"
                  title="Drag to resize"
                  onPointerDown={(e) => {
                    startDrag(e, id, 'size');
                  }}
                />
              )}
            </section>
          );
        })}
      </div>
      {cards.length === 0 && (
        <p className="hint">Every card is hidden. Choose Edit home to show some again.</p>
      )}
    </article>
  );
}
