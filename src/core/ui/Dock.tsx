import { MoreHorizontal, Plus } from 'lucide-react';
import { useState, type DragEvent } from 'react';
import type { DockPlace } from '../settings/layout';
import { useApp } from './AppStoreContext';
import { Menu, type MenuItem } from './Menu';
import { ViewBoundary } from './ModuleView';
import type { WidgetEntry } from './widgets';

/** What a dragged widget tab carries. */
const WIDGET_DRAG = 'application/x-benchwork-widget';

export const PLACE_NAMES: Record<DockPlace, string> = {
  left: 'Under the notebooks',
  rightTop: 'Right side, top',
  rightBottom: 'Right side, bottom',
};

/**
 * A group of widgets as tabs. Tabs can be dragged to another dock; the +
 * adds a widget, and the … moves or closes the one showing.
 */
export function Dock({
  place,
  ids,
  widgets,
  className,
}: {
  place: DockPlace;
  /** The widgets in this dock, in order. */
  ids: string[];
  /** Every widget there is. */
  widgets: WidgetEntry[];
  className?: string;
}) {
  const placeWidget = useApp((s) => s.placeWidget);
  const closeWidget = useApp((s) => s.closeWidget);
  const addToHome = useApp((s) => s.addToHome);
  const pagePath = useApp((s) => s.page?.path ?? null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ kind: 'add' | 'more'; x: number; y: number } | null>(null);
  const [dropping, setDropping] = useState(false);

  const entries = ids
    .map((id) => widgets.find((w) => w.id === id))
    .filter((w): w is WidgetEntry => w !== undefined);
  const current = entries.find((w) => w.id === chosen) ?? entries[0];
  const name = PLACE_NAMES[place];

  const onDragOver = (e: DragEvent) => {
    if (!e.dataTransfer.types.includes(WIDGET_DRAG)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropping(true);
  };
  const onDrop = (e: DragEvent) => {
    const id = e.dataTransfer.getData(WIDGET_DRAG);
    setDropping(false);
    if (id === '') return;
    e.preventDefault();
    setChosen(id);
    void placeWidget(widgets, id, place);
  };

  const addItems: MenuItem[] = widgets
    .filter((w) => !ids.includes(w.id))
    .map((w) => ({
      label: w.title,
      onSelect: () => {
        setChosen(w.id);
        void placeWidget(widgets, w.id, place);
      },
    }));
  const moreItems: MenuItem[] =
    current === undefined
      ? []
      : [
          ...(Object.keys(PLACE_NAMES) as DockPlace[])
            .filter((p) => p !== place)
            .map((p) => ({
              label: `Move to ${PLACE_NAMES[p].toLowerCase()}`,
              onSelect: () => void placeWidget(widgets, current.id, p),
            })),
          { label: 'Add to Home', onSelect: () => void addToHome(current.id) },
          { label: 'Close', onSelect: () => void closeWidget(current.id), danger: true },
        ];

  return (
    <section
      className={[
        'dock',
        className,
        dropping ? 'dropping' : '',
        entries.length === 0 ? 'empty' : '',
      ]
        .filter((c) => c !== undefined && c !== '')
        .join(' ')}
      aria-label={name}
      onDragOver={onDragOver}
      onDragLeave={() => {
        setDropping(false);
      }}
      onDrop={onDrop}
    >
      <div className="dock-tabs" role="tablist" aria-label={name}>
        {entries.length === 0 && <span className="dock-empty-hint">Widgets</span>}
        {entries.map((w) => (
          <button
            key={w.id}
            type="button"
            role="tab"
            className="dock-tab"
            title={w.title}
            aria-label={w.title}
            aria-selected={w.id === current?.id}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(WIDGET_DRAG, w.id);
              e.dataTransfer.effectAllowed = 'move';
            }}
            onClick={() => {
              setChosen(w.id);
            }}
          >
            {w.icon}
            {entries.length <= 2 && <span className="dock-tab-name">{w.title}</span>}
          </button>
        ))}
        <span className="dock-tools">
          <button
            type="button"
            className="icon-button"
            title="Add a widget"
            aria-label={`Add a widget ${name.toLowerCase()}`}
            disabled={addItems.length === 0}
            onClick={(e) => {
              setMenu({ kind: 'add', x: e.clientX, y: e.clientY });
            }}
          >
            <Plus size={15} strokeWidth={1.75} aria-hidden />
          </button>
          {current !== undefined && (
            <button
              type="button"
              className="icon-button"
              title={`Move or close ${current.title}`}
              aria-label={`Move or close ${current.title}`}
              onClick={(e) => {
                setMenu({ kind: 'more', x: e.clientX, y: e.clientY });
              }}
            >
              <MoreHorizontal size={15} strokeWidth={1.75} aria-hidden />
            </button>
          )}
        </span>
      </div>
      {current !== undefined && (
        <div className="dock-body" role="tabpanel" aria-label={current.title}>
          {current.moduleId === null ? (
            current.render(pagePath)
          ) : (
            // Keyed, so a widget that failed for one page can try again for the next.
            <ViewBoundary key={`${current.id} ${pagePath ?? ''}`} moduleId={current.moduleId}>
              {current.render(pagePath)}
            </ViewBoundary>
          )}
        </div>
      )}
      {menu !== null && (
        <Menu
          label={menu.kind === 'add' ? 'Add a widget' : 'Widget'}
          x={menu.x}
          y={menu.y}
          items={menu.kind === 'add' ? addItems : moreItems}
          onClose={() => {
            setMenu(null);
          }}
        />
      )}
    </section>
  );
}

/**
 * The line between two docks stacked one above the other. Dragging it, or
 * the arrow keys, changes the size; it is saved once let go.
 */
export function DockSplitter({
  label,
  onMove,
  onDone,
}: {
  label: string;
  /** How far the pointer is from where the drag began, in pixels. */
  onMove: (dy: number) => void;
  onDone: (dy: number) => void;
}) {
  const [start, setStart] = useState<number | null>(null);
  return (
    <div
      className={start === null ? 'dock-splitter' : 'dock-splitter dragging'}
      role="separator"
      aria-orientation="horizontal"
      aria-label={label}
      tabIndex={0}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        setStart(e.clientY);
      }}
      onPointerMove={(e) => {
        if (start !== null) onMove(e.clientY - start);
      }}
      onPointerUp={(e) => {
        if (start === null) return;
        onDone(e.clientY - start);
        setStart(null);
      }}
      onKeyDown={(e) => {
        const dy = e.key === 'ArrowUp' ? -24 : e.key === 'ArrowDown' ? 24 : 0;
        if (dy === 0) return;
        e.preventDefault();
        onDone(dy);
      }}
    />
  );
}
