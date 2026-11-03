import { ChevronDown, Search } from 'lucide-react';
import { useState } from 'react';
import { useApp } from './AppStoreContext';

/** A bounded launcher leaves the notebook list usable with many enabled modules. */
export function SidebarTools() {
  const tools = useApp((s) => s.pageViews).filter((v) => v.tool !== undefined);
  const current = useApp((s) => s.moduleView);
  const open = useApp((s) => s.openModuleView);
  const collapsed = useApp((s) => s.settings.appearance.toolsCollapsed);
  const appearance = useApp((s) => s.setAppearance);
  const [search, setSearch] = useState('');
  if (tools.length === 0) return null;
  const found = tools.filter((v) =>
    `${v.title} ${v.tool?.hint ?? ''}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <li className="nav-group sidebar-tools" aria-label="Tools">
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
      {!collapsed && (
        <div id="sidebar-tool-list">
          {tools.length > 6 && (
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
          <ul className="tools-scroll">
            {found.map((v) => (
              <li key={v.id}>
                <button
                  type="button"
                  className="nav-item"
                  title={v.tool?.hint}
                  aria-pressed={current?.id === v.id}
                  onClick={() => void open(v.id)}
                >
                  {v.tool?.icon}
                  {v.title}
                </button>
              </li>
            ))}
          </ul>
          {found.length === 0 && <p className="hint">No matching tools.</p>}
        </div>
      )}
    </li>
  );
}
