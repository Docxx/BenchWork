import { createStore, type StoreApi } from 'zustand/vanilla';
import { createContributions } from '../modules/contributions';
import { ModuleRegistry } from '../modules/registry';
import type { PlatformAdapter } from '../platform';
import { createStoreContext } from './context';
import { createModulesSlice, type ModulesSlice } from './modulesSlice';
import { createNotebookSlice, type NotebookSlice } from './notebookSlice';
import { createSettingsSlice, type SettingsSlice } from './settingsSlice';
import { createTreeSlice, type TreeSlice } from './treeSlice';
import { createVaultSlice, type VaultSlice } from './vaultSlice';

export { describeError } from './context';
export type { PendingModuleChange } from './modulesSlice';
export { LINK_THRESHOLD_RANGE, type View } from './settingsSlice';
export type { PickMode, VaultStatus } from './vaultSlice';

/** The whole app state: one slice per area, sharing a StoreContext. */
export type AppState = VaultSlice & TreeSlice & NotebookSlice & SettingsSlice & ModulesSlice;

export type AppStore = StoreApi<AppState>;

/**
 * @param registry the app's modules. Tests may leave it out for a registry
 *   with no modules.
 */
export function createAppStore(
  platform: PlatformAdapter,
  registry: ModuleRegistry = new ModuleRegistry([], [], {
    platform,
    device: platform.kind,
    contributions: createContributions(),
  }),
): AppStore {
  const store = createStore<AppState>()((set, get) => {
    const ctx = createStoreContext(platform, registry, set, get);
    // Slices register vault hooks in this order: opening runs them in order,
    // closing in reverse.
    return {
      ...createVaultSlice(ctx),
      ...createTreeSlice(ctx),
      ...createNotebookSlice(ctx),
      ...createSettingsSlice(ctx),
      ...createModulesSlice(ctx),
    };
  });

  registry.store.subscribe((modules) => {
    store.setState({ modules });
  });
  registry.contributions.subscribe(({ panels }) => {
    store.setState({ panels });
  });
  return store;
}
