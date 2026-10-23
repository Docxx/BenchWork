import { createStore, type StoreApi } from 'zustand/vanilla';
import type { CommandSpec, FileHandlerSpec, PageTypeSpec, SidebarPanelSpec } from '../api';

export interface SidebarPanel extends SidebarPanelSpec {
  moduleId: string;
}

export interface PageType extends PageTypeSpec {
  moduleId: string;
}

export interface Command extends CommandSpec {
  moduleId: string;
}

export interface FileHandler extends FileHandlerSpec {
  moduleId: string;
}

export interface ContributionsState {
  /** Sidebar panels from modules that are on, in the order they registered. */
  panels: SidebarPanel[];
  pageTypes: PageType[];
  commands: Command[];
  fileHandlers: FileHandler[];
}

/** Everything modules have added to the UI. The UI reads it; modules add via their context. */
export type Contributions = StoreApi<ContributionsState>;

export function createContributions(): Contributions {
  return createStore<ContributionsState>()(() => ({
    panels: [],
    pageTypes: [],
    commands: [],
    fileHandlers: [],
  }));
}

/** The handler for a file, by its ending; the longest matching ending wins. */
export function handlerFor(handlers: readonly FileHandler[], path: string): FileHandler | null {
  const name = path.toLowerCase();
  let best: { handler: FileHandler; length: number } | null = null;
  for (const handler of handlers) {
    for (const ext of handler.extensions) {
      if (name.endsWith(ext) && (best === null || ext.length > best.length)) {
        best = { handler, length: ext.length };
      }
    }
  }
  return best?.handler ?? null;
}
