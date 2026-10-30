import { useState } from 'react';
import type { ModuleContext } from '@core/api';
import type { TimerStore } from './timers';
import { GROUPS, TOOLS } from './tools';

/** The tool last used, so the tools open where they were left. */
const remembered = { tool: TOOLS[0]?.id ?? '' };

function remember(id: string): void {
  remembered.tool = id;
}

/**
 * Every calculator, grouped. As a full view, tools are listed down the
 * side; beside a page, they are chosen from a menu and answers can be
 * added to the page.
 */
export function LabToolsView({
  ctx,
  timers,
  beside = false,
  canInsert = beside,
  initial,
}: {
  ctx: ModuleContext;
  timers: TimerStore;
  /** In a dock: tools chosen from a menu. */
  beside?: boolean;
  /** Beside an open page, so answers can be added to it. */
  canInsert?: boolean;
  initial?: string | null;
}) {
  const [toolId, setToolId] = useState(
    initial !== undefined && initial !== null && TOOLS.some((t) => t.id === initial)
      ? initial
      : remembered.tool,
  );
  const tool = TOOLS.find((t) => t.id === toolId) ?? TOOLS[0];
  const choose = (id: string) => {
    remember(id);
    setToolId(id);
  };
  if (!tool) return null;
  const out = { ctx, canInsert };

  return (
    <div className={beside ? 'lab-tools beside' : 'lab-tools'}>
      {beside ? (
        <select
          className="lab-picker"
          aria-label="Tool"
          value={tool.id}
          onChange={(e) => {
            choose(e.target.value);
          }}
        >
          {GROUPS.map((g) => (
            <optgroup key={g} label={g}>
              {TOOLS.filter((t) => t.group === g).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      ) : (
        <nav className="lab-nav" aria-label="Lab tools">
          {GROUPS.map((g) => (
            <div key={g} className="lab-nav-group">
              <span className="lab-nav-name">{g}</span>
              {TOOLS.filter((t) => t.group === g).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={t.id === tool.id}
                  onClick={() => {
                    choose(t.id);
                  }}
                >
                  {t.name}
                </button>
              ))}
            </div>
          ))}
        </nav>
      )}
      <section className="lab-tool" aria-label={tool.name}>
        {!beside && <h2>{tool.name}</h2>}
        {/* Keyed, so each tool starts with its own empty fields. */}
        <div key={tool.id} className="lab-fields">
          {tool.render(out, timers)}
        </div>
      </section>
    </div>
  );
}
