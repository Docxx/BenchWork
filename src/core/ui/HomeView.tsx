import { ArrowDown, ArrowUp, EyeOff, Plus } from 'lucide-react';
import { useState } from 'react';
import { homeWidgets } from '../settings/layout';
import { moveCard, orderCards } from '../state/homeSlice';
import { useApp } from './AppStoreContext';
import { Menu } from './Menu';
import { ViewBoundary } from './ModuleView';
import { SidePanelToggle } from './PageView';
import { vaultName } from './Sidebar';
import { useHomeLayout, useWidgets } from './widgets';

/** "Good morning" and so on, by the hour. */
export function greeting(now: Date): string {
  const hour = now.getHours();
  if (hour < 5) return 'Good evening';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/**
 * Home: what BenchWork shows when nothing else is open. Its cards are
 * widgets, from the app and from modules; they can be added, moved and
 * hidden, per vault, on this device.
 */
export function HomeView() {
  const status = useApp((s) => s.status);
  const layout = useHomeLayout();
  const setLayout = useApp((s) => s.setHomeLayout);
  const addToHome = useApp((s) => s.addToHome);
  const widgets = useWidgets();
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState<{ x: number; y: number } | null>(null);
  const now = new Date();

  const byId = new Map(widgets.map((w) => [w.id, w]));
  const order = orderCards(homeWidgets(widgets, layout.added), layout);
  const shown = order.filter((id) => !layout.hidden.includes(id));
  const hidden = order.filter((id) => layout.hidden.includes(id));
  const addable = widgets.filter((w) => !order.includes(w.id));

  const move = (id: string, by: -1 | 1) => {
    // Moves past hidden cards, so each press visibly moves the card.
    const next = moveCard(shown, id, by);
    void setLayout({ order: [...next, ...hidden] });
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
            className="quiet"
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

      <div className="home-grid">
        {shown.map((id, i) => {
          const card = byId.get(id);
          if (!card) return null;
          const headingId = `home-card-${id.replace(/[^a-z0-9]/gi, '-')}`;
          return (
            <section
              key={id}
              className={card.wide ? 'home-card wide' : 'home-card'}
              aria-labelledby={headingId}
            >
              <header className="home-card-head">
                {card.icon}
                <h2 id={headingId}>{card.title}</h2>
                {editing && (
                  <span className="home-card-tools">
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Move ${card.title} up`}
                      title="Move up"
                      disabled={i === 0}
                      onClick={() => {
                        move(id, -1);
                      }}
                    >
                      <ArrowUp size={15} strokeWidth={1.75} aria-hidden />
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Move ${card.title} down`}
                      title="Move down"
                      disabled={i === shown.length - 1}
                      onClick={() => {
                        move(id, 1);
                      }}
                    >
                      <ArrowDown size={15} strokeWidth={1.75} aria-hidden />
                    </button>
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
            </section>
          );
        })}
      </div>
      {shown.length === 0 && (
        <p className="hint">Every card is hidden. Choose Edit home to show some again.</p>
      )}
    </article>
  );
}
