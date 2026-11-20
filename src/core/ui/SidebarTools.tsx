import { useState } from 'react';
import { ChevronDown, Columns2, Pin, PinOff, Search } from 'lucide-react';
import { moduleCategory } from '../modules/categories';
import { useApp } from './AppStoreContext';

/**
 * The sidebar's Tools list: what the modules add, such as the planner.
 * Pinned tools stay at the top; the rest sit under the kind of work they
 * are for, and the search finds any of them by name or by what they do.
 */
export function SidebarTools() {
  const tools = useApp((s) => s.pageViews).filter((v) => v.tool !== undefined);
  const current = useApp((s) => s.moduleView);
  const open = useApp((s) => s.openModuleView);
  const showIcons = useApp((s) => s.settings.appearance.toolIconBar);
  const height = useApp((s) => s.settings.appearance.toolsHeight);
  const collapsed = useApp((s) => s.settings.appearance.toolsCollapsed);
  const pinned = useApp((s) => s.settings.appearance.pinnedTools);
  const appearance = useApp((s) => s.setAppearance);
  const [search, setSearch] = useState('');
  if (tools.length === 0) return null;
  const q = search.trim().toLowerCase();
  const found = tools.filter((v) =>
    `${v.title} ${v.tool?.hint ?? ''} ${moduleCategory(v.moduleId)}`.toLowerCase().includes(q),
  );
  const top = found.filter((v) => pinned.includes(v.id));
  const rest = found.filter((v) => !pinned.includes(v.id));
  // Headings only help once there is enough to group.
  const grouped = rest.length > 5;
  const kinds = grouped ? [...new Set(rest.map((v) => moduleCategory(v.moduleId)))].sort() : [''];

  const row = (v: (typeof tools)[number]) => {
    const isPinned = pinned.includes(v.id);
    return (
      <li key={v.id} className="tool-row">
        <button
          type="button"
          id={`tool-${v.id}`}
          className="nav-item"
          title={v.tool?.hint}
          aria-pressed={current?.id === v.id}
          onClick={() => void open(v.id)}
        >
          {v.tool?.icon}
          {v.title}
        </button>
        <button
          type="button"
          className="icon-button tool-pin"
          aria-pressed={isPinned}
          aria-label={isPinned ? 'Unpin' : 'Pin to the top'}
          aria-describedby={`tool-${v.id}`}
          title={isPinned ? 'Unpin' : 'Pin to the top'}
          onClick={() =>
            void appearance({
              pinnedTools: isPinned ? pinned.filter((p) => p !== v.id) : [...pinned, v.id],
            })
          }
        >
          {isPinned ? (
            <PinOff size={13} strokeWidth={1.75} aria-hidden />
          ) : (
            <Pin size={13} strokeWidth={1.75} aria-hidden />
          )}
        </button>
      </li>
    );
  };

  return (
    <li className="nav-group sidebar-tools" aria-label="Tools">
      <div className="tools-heading">
        <div className="tools-heading-row">
          <button
            type="button"
            className="tools-toggle"
            aria-expanded={!collapsed}
            aria-controls="sidebar-tool-list"
            onClick={() => void appearance({ toolsCollapsed: !collapsed })}
          >
            <ChevronDown size={15} className={collapsed ? 'folded' : ''} aria-hidden />
            Tools <span>{tools.length}</span>
          </button>
          <button
            type="button"
            className="tool-bar-choice"
            aria-pressed={showIcons}
            title="Show a side bar with an icon for each tool"
            onClick={() => void appearance({ toolIconBar: !showIcons })}
          >
            <Columns2 size={14} aria-hidden /> Icon bar
          </button>
        </div>
        {!collapsed && tools.length > 6 && (
          <label className="tools-search">
            <Search size={14} aria-hidden />
            <input
              type="search"
              aria-label="Find a tool"
              placeholder="Find a tool…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
              }}
            />
          </label>
        )}
      </div>
      {!collapsed && (
        <div id="sidebar-tool-list">
          <ToolsHeightChoice />
          <div
            className="tools-list"
            style={height ? { maxHeight: height, overflowY: 'auto' } : undefined}
          >
            {top.length > 0 && (
              <ul aria-label="Pinned tools" className="tools-pinned">
                {top.map(row)}
              </ul>
            )}
            {kinds.map((kind) => (
              <ul key={kind} aria-label={kind === '' ? 'Tools' : kind}>
                {kind !== '' && (
                  <li className="tools-kind" role="presentation">
                    {kind}
                  </li>
                )}
                {rest.filter((v) => !grouped || moduleCategory(v.moduleId) === kind).map(row)}
              </ul>
            ))}
          </div>
          {found.length === 0 && <p className="hint">No matching tools.</p>}
        </div>
      )}
    </li>
  );
}

export function ToolIconBar() {
  const views = useApp((s) => s.pageViews);
  const enabled = useApp((s) => s.settings.appearance.toolIconBar);
  const pinned = useApp((s) => s.settings.appearance.pinnedTools);
  const current = useApp((s) => (s.view === 'files' ? s.moduleView?.id : null));
  const open = useApp((s) => s.openModuleView);
  if (!enabled) return null;
  const tools = views
    .filter((v) => v.tool)
    .sort((a, b) => Number(pinned.includes(b.id)) - Number(pinned.includes(a.id)));
  if (!tools.length) return null;
  return (
    <nav className="tool-icon-bar" aria-label="Tool shortcuts">
      {tools.map((v) => (
        <button
          key={v.id}
          type="button"
          aria-label={v.title}
          title={v.title}
          aria-current={current === v.id ? 'page' : undefined}
          onClick={() => void open(v.id)}
        >
          {v.tool?.icon}
        </button>
      ))}
    </nav>
  );
}

export function ToolsHeightChoice() {
  const height = useApp((s) => s.settings.appearance.toolsHeight);
  const save = useApp((s) => s.setAppearance);
  return (
    <label className="tools-height-choice">
      List height
      <select
        aria-label="Tools list height"
        value={height}
        onChange={(e) => void save({ toolsHeight: Number(e.target.value) })}
      >
        {[
          [0, 'Full list'],
          [160, 'Short'],
          [320, 'Medium'],
          [520, 'Tall'],
          [800, 'Extra tall'],
        ].map(([value, name]) => (
          <option key={value} value={value}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
}
