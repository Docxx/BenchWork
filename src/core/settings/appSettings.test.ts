// @vitest-environment node
import { defaultAppearance } from './appearance';
import { MemoryAdapter } from '../platform/memory';
import {
  defaultAppSettings,
  loadAppSettings,
  parseAppSettings,
  saveAppSettings,
  toStoredAppSettings,
} from './appSettings';

describe('app settings', () => {
  it('falls back to defaults for missing or broken data', () => {
    for (const data of [null, undefined, 'text', [1], { theme: 'purple', lastVault: 7 }]) {
      expect(parseAppSettings(data)).toEqual(defaultAppSettings());
    }
  });

  it('reads known values and keeps unknown keys', () => {
    const stored = {
      version: 1,
      lastVault: 'C:\\Vault',
      theme: 'dark',
      showAllFiles: true,
      penMode: 'text',
      window: { w: 900 },
    };
    const settings = parseAppSettings(stored);
    expect(settings.penMode).toBe('text');
    expect(parseAppSettings({ penMode: 'scribble' }).penMode).toBe('draw');
    expect(settings.lastVault).toBe('C:\\Vault');
    expect(settings.theme).toBe('dark');
    expect(toStoredAppSettings(settings)).toEqual({ ...stored, appearance: defaultAppearance() });
  });

  it('saves and loads through the platform', async () => {
    const platform = new MemoryAdapter();
    await saveAppSettings(platform, { ...defaultAppSettings(), lastVault: 'C:\\Vault' });
    expect((await loadAppSettings(platform)).lastVault).toBe('C:\\Vault');
  });

  it('uses defaults if the platform cannot read settings', async () => {
    const platform = new MemoryAdapter();
    platform.loadAppSettings = () => Promise.reject(new Error('disk on fire'));
    expect(await loadAppSettings(platform)).toEqual(defaultAppSettings());
  });
});
