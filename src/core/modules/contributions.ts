import { createStore, type StoreApi } from 'zustand/vanilla';
import type { SidebarPanelSpec } from '../api';

export interface SidebarPanel extends SidebarPanelSpec {
  moduleId: string;
}

export interface ContributionsState {
  /** Sidebar panels from modules that are on, in the order they registered. */
  panels: SidebarPanel[];
}

/** Everything modules have added to the UI. The UI reads it; modules add via their context. */
export type Contributions = StoreApi<ContributionsState>;

export function createContributions(): Contributions {
  return createStore<ContributionsState>()(() => ({ panels: [] }));
}
