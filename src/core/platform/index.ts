import { isTauri } from '@tauri-apps/api/core';
import { MemoryAdapter } from './memory';
import { TauriAdapter } from './tauri';
import type { PlatformAdapter } from './types';

export { PlatformError, type PlatformErrorKind } from './errors';
export { MATCH_END, MATCH_START } from './types';
export type {
  DeviceKind,
  DirEntry,
  FileInfo,
  IndexedLink,
  IndexedPage,
  IndexEntry,
  LinkRef,
  PageRef,
  PandocWordOptions,
  PlatformAdapter,
  SearchHit,
  SearchIndex,
  TagCount,
  VaultChange,
  VaultOwner,
} from './types';
export {
  baseName,
  fullBaseName,
  joinVaultPath,
  normaliseVaultPath,
  parentVaultPath,
  vaultPathOf,
} from './vaultPath';

declare global {
  interface Window {
    /** Set only when VITE_PLATFORM=memory, so Playwright can seed folders. */
    __benchworkMemory?: MemoryAdapter;
  }
}

/**
 * Picks the adapter for where the app is running. Outside Tauri (a plain
 * browser, or Playwright with VITE_PLATFORM=memory) it uses the in-memory one.
 */
export function createPlatform(): PlatformAdapter {
  if (import.meta.env['VITE_PLATFORM'] === 'memory') {
    const adapter = new MemoryAdapter();
    window.__benchworkMemory = adapter;
    return adapter;
  }
  return isTauri() ? new TauriAdapter() : new MemoryAdapter();
}
