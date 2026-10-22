import { isTauri } from '@tauri-apps/api/core';
import { MemoryAdapter } from './memory';
import { TauriAdapter } from './tauri';
import type { PlatformAdapter } from './types';

export { PlatformError, type PlatformErrorKind } from './errors';
export type { DeviceKind, DirEntry, PlatformAdapter, VaultOwner } from './types';
export { baseName, joinVaultPath, normaliseVaultPath, parentVaultPath } from './vaultPath';

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
