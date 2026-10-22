import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { PlatformError } from './errors';
import type { DeviceKind, DirEntry, PlatformAdapter } from './types';
import { normaliseVaultPath } from './vaultPath';

/**
 * Arguments are built lazily so a path that fails `normaliseVaultPath`
 * becomes a rejected promise rather than a synchronous throw.
 */
async function call<T>(command: string, args?: () => Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args?.());
  } catch (err) {
    throw PlatformError.from(err);
  }
}

function detectKind(): DeviceKind {
  return /Android/i.test(navigator.userAgent) ? 'tablet' : 'desktop';
}

/**
 * Talks to the Rust commands in src-tauri/src/lib.rs. Paths are checked here
 * first for quick, consistent errors; the Rust path guard checks them again
 * and is the real boundary.
 */
export class TauriAdapter implements PlatformAdapter {
  readonly kind: DeviceKind = detectKind();

  async pickFolder(options: { title: string }): Promise<string | null> {
    try {
      const picked = await open({ directory: true, multiple: false, title: options.title });
      return typeof picked === 'string' ? picked : null;
    } catch (err) {
      throw PlatformError.from(err);
    }
  }

  setVaultRoot(root: string): Promise<string> {
    return call('set_vault_root', () => ({ root }));
  }

  listDir(path: string): Promise<DirEntry[]> {
    return call('list_dir', () => ({ path: normaliseVaultPath(path) }));
  }

  readText(path: string): Promise<string> {
    return call('read_text', () => ({ path: normaliseVaultPath(path) }));
  }

  writeTextAtomic(path: string, text: string): Promise<void> {
    return call('write_text_atomic', () => ({ path: normaliseVaultPath(path), text }));
  }

  ensureDir(path: string): Promise<void> {
    return call('ensure_dir', () => ({ path: normaliseVaultPath(path) }));
  }

  exists(path: string): Promise<boolean> {
    return call('exists', () => ({ path: normaliseVaultPath(path) }));
  }

  loadAppSettings(): Promise<unknown> {
    return call('load_app_settings');
  }

  saveAppSettings(settings: unknown): Promise<void> {
    return call('save_app_settings', () => ({ settings }));
  }
}
