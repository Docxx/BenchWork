import { Component, type ErrorInfo, type ReactNode } from 'react';
import type { SidebarPanel } from '../modules/contributions';
import { useApp } from './AppStoreContext';

/** Sidebar panels from modules that are on, each isolated from the others. */
export function ModulePanels() {
  const panels = useApp((s) => s.panels);
  if (panels.length === 0) return null;

  return (
    <div className="module-panels">
      {panels.map((panel) => (
        <section
          key={panel.id}
          className="module-panel"
          aria-labelledby={`panel-${panel.id}`}
          data-module={panel.moduleId}
        >
          <h2 id={`panel-${panel.id}`} className="module-panel-title">
            {panel.title}
          </h2>
          <PanelBoundary panel={panel}>
            <PanelBody panel={panel} />
          </PanelBoundary>
        </section>
      ))}
    </div>
  );
}

function PanelBody({ panel }: { panel: SidebarPanel }) {
  return <div className="module-panel-body">{panel.render()}</div>;
}

interface BoundaryState {
  failed: boolean;
}

/** Stops a panel that throws while drawing from breaking the rest of the app. */
class PanelBoundary extends Component<{ panel: SidebarPanel; children: ReactNode }, BoundaryState> {
  override state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(
      `[${this.props.panel.moduleId}] Panel '${this.props.panel.id}' failed:`,
      error,
      info,
    );
  }

  override render(): ReactNode {
    if (this.state.failed) {
      return <p className="module-panel-error">This panel could not be shown.</p>;
    }
    return this.props.children;
  }
}
