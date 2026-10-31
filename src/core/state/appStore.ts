import { createStore, type StoreApi } from 'zustand/vanilla';
import { createContributions } from '../modules/contributions';
import { ModuleRegistry } from '../modules/registry';
import type { PlatformAdapter } from '../platform';
import { createStoreContext } from './context';
import { createAttachmentsSlice, type AttachmentsSlice } from './attachmentsSlice';
import { createDailySlice, type DailySlice } from './dailySlice';
import { createFilesSlice, type FilesSlice } from './filesSlice';
import { createInkSlice, type InkSlice } from './inkSlice';
import { createScreenSlice, type ScreenSlice } from './screenSlice';
import { createSyncSlice, type SyncSlice } from './syncSlice';
import { createBackupSlice, type BackupSlice } from './backupSlice';
import { createHomeSlice, type HomeSlice } from './homeSlice';
import { createLinksSlice, type LinksSlice } from './linksSlice';
import { createModuleBridge } from './moduleBridge';
import { createModulesSlice, type ModulesSlice } from './modulesSlice';
import { createNotebookSlice, type NotebookSlice } from './notebookSlice';
import { createPageSlice, type PageSlice } from './pageSlice';
import { createSearchSlice, type SearchSlice } from './searchSlice';
import { createSettingsSlice, type SettingsSlice } from './settingsSlice';
import { createTreeSlice, type TreeSlice } from './treeSlice';
import { createVaultSlice, type VaultSlice } from './vaultSlice';

export { describeError } from './context';
export type { AddedFile, AttachChoice, AttachQuestion } from './attachmentsSlice';
export type { DayNeighbours } from './dailySlice';
export type { Backlink } from './linksSlice';
export type { PendingModuleChange, TextPrompt } from './modulesSlice';
export type { SearchResult } from './searchSlice';
export { LINK_THRESHOLD_RANGE, type View } from './settingsSlice';
export type { PickMode, VaultStatus } from './vaultSlice';

/** The whole app state: one slice per area, sharing a StoreContext. */
export type AppState = VaultSlice &
  TreeSlice &
  NotebookSlice &
  PageSlice &
  FilesSlice &
  AttachmentsSlice &
  SearchSlice &
  LinksSlice &
  DailySlice &
  SettingsSlice &
  ModulesSlice &
  InkSlice &
  ScreenSlice &
  SyncSlice &
  BackupSlice &
  HomeSlice;

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
      ...createPageSlice(ctx),
      ...createFilesSlice(ctx),
      ...createAttachmentsSlice(ctx),
      ...createSearchSlice(ctx),
      ...createLinksSlice(ctx),
      ...createDailySlice(ctx),
      ...createSettingsSlice(ctx),
      ...createModulesSlice(ctx),
      ...createInkSlice(ctx),
      ...createScreenSlice(ctx),
      ...createSyncSlice(ctx),
      ...createBackupSlice(ctx),
      ...createHomeSlice(ctx),
    };
  });

  registry.store.subscribe((modules) => {
    store.setState({ modules });
  });
  registry.contributions.subscribe(
    ({
      panels,
      pageTypes,
      commands,
      fileHandlers,
      settingsPanels,
      pageViews,
      widgets,
      calendarSources,
      scheduleSources,
      strokeFilters,
      inkTools,
      inkRecognisers,
      citationProviders,
      citationVersion,
    }) => {
      store.setState({
        pageViews,
        widgets,
        calendarSources,
        scheduleSources,
        strokeFilters,
        inkTools,
        inkRecognisers,
        panels,
        pageTypes,
        commands,
        fileHandlers,
        settingsPanels,
        citationProviders,
        citationVersion,
      });
    },
  );
  registry.connectApp(createModuleBridge(store, platform));
  return store;
}
