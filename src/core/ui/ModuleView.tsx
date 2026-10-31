import { Component, type ErrorInfo, type ReactNode } from 'react';
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
      <header className="module-view-header" data-tauri-drag-region>
        <h1>{view.title}</h1>
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
