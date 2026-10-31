import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useState } from 'react';
import { PanelRightOpen } from 'lucide-react';
import { useWidgets } from './widgets';
import { Menu } from './Menu';
import type { OpenModuleView } from '../state/filesSlice';
import { useApp } from './AppStoreContext';
import { SidePanelToggle } from './PageView';

/** A module's full-page view in the main area, such as a timeline or an overview. */
export function ModuleView({ open }: { open: OpenModuleView }) {
  const view = useApp((s) => s.pageViews.find((v) => v.id === open.id));
  const close = useApp((s) => s.closeModuleView);

  if (!view) {
    return (
      <article className="module-view">
        <p className="page-empty">This view is not available. Its module may be switched off.</p>
      </article>
    );
  }

  return (
    <article className="module-view" aria-label={view.title}>
      <header className="module-view-header" data-window-drag>
        <h1>{view.title}</h1>
        {view.tool && (
          <DockToolButton viewId={view.id} moduleId={view.moduleId} title={view.title} />
        )}
        <SidePanelToggle />
        <button type="button" className="quiet" aria-label="Close" title="Close" onClick={close}>
          ×
        </button>
      </header>
      <ViewBoundary key={`${open.id} ${open.param ?? ''}`} moduleId={view.moduleId}>
        {view.render(open.param)}
      </ViewBoundary>
    </article>
  );
}

/** Stops a view that throws while drawing from breaking the rest of the app. */
export class ViewBoundary extends Component<
  { moduleId: string; children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[${this.props.moduleId}] A view failed:`, error, info);
  }

  override render(): ReactNode {
    if (this.state.failed)
      return <p className="module-panel-error">This view could not be shown.</p>;
    return this.props.children;
  }
}

function DockToolButton({
  viewId,
  moduleId,
  title,
}: {
  viewId: string;
  moduleId: string;
  title: string;
}) {
  const widgets = useWidgets();
  const place = useApp((s) => s.placeWidget);
  const appearance = useApp((s) => s.setAppearance);
  const compact = useApp((s) => s.compact);
  const drawer = useApp((s) => s.setDrawer);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const widget =
    widgets.find((w) => w.moduleId === moduleId && w.title === title) ??
    widgets.find((w) => w.id === `tool:${viewId}`);
  if (!widget) return null;
  return (
    <>
      <button
        type="button"
        className="quiet"
        aria-label="Dock tool"
        title="Use this tool beside your work"
        onClick={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          setMenu({ x: box.left, y: box.bottom });
        }}
      >
        <PanelRightOpen size={17} aria-hidden /> Dock tool
      </button>
      {menu && (
        <Menu
          label="Dock tool"
          x={menu.x}
          y={menu.y}
          onClose={() => {
            setMenu(null);
          }}
          items={[
            {
              label: 'Right side, top',
              onSelect: () => {
                void place(widgets, widget.id, 'rightTop');
                void appearance({ sidePanel: true });
                if (compact) drawer('panel');
              },
            },
            {
              label: 'Right side, bottom',
              onSelect: () => {
                void place(widgets, widget.id, 'rightBottom');
                void appearance({ sidePanel: true });
                if (compact) drawer('panel');
              },
            },
            {
              label: 'Under the notebooks',
              onSelect: () => {
                void place(widgets, widget.id, 'left');
                if (compact) drawer('sidebar');
              },
            },
          ]}
        />
      )}
    </>
  );
}
