import type { PlatformAdapter } from '../platform';
import { defaultAppearance, parseAppearance, type Appearance } from './appearance';

/**
 * Per-device settings, kept in the app's own config folder rather than the
 * vault, so a PC and a tablet sharing one vault can differ.
 */
export type Theme = 'system' | 'light' | 'dark';

export interface AppSettings {
  version: 1;
  /** Full path of the last vault opened on this device. */
  lastVault: string | null;
  theme: Theme;
  /** Show every file in the sidebar, not just pages. */
  showAllFiles: boolean;
  /** Theme preset, colours, fonts and sizes. */
  appearance: Appearance;
  /** Keys this version does not know about, kept on save. */
  extra: Record<string, unknown>;
}

const THEMES: readonly Theme[] = ['system', 'light', 'dark'];
const KNOWN_KEYS = new Set(['version', 'lastVault', 'theme', 'showAllFiles', 'appearance']);

export function defaultAppSettings(): AppSettings {
  return {
    version: 1,
    lastVault: null,
    theme: 'system',
    showAllFiles: false,
    appearance: defaultAppearance(),
    extra: {},
  };
}

/** Never throws: anything unreadable falls back to the default. */
export function parseAppSettings(data: unknown): AppSettings {
  const settings = defaultAppSettings();
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return settings;
  const record = data as Record<string, unknown>;

  const lastVault = record['lastVault'];
  if (typeof lastVault === 'string' && lastVault !== '') settings.lastVault = lastVault;

  const theme = record['theme'];
  if (typeof theme === 'string' && (THEMES as readonly string[]).includes(theme)) {
    settings.theme = theme as Theme;
  }

  if (typeof record['showAllFiles'] === 'boolean') settings.showAllFiles = record['showAllFiles'];
  settings.appearance = parseAppearance(record['appearance']);

  for (const [key, value] of Object.entries(record)) {
    if (!KNOWN_KEYS.has(key)) settings.extra[key] = value;
  }
  return settings;
}

export function toStoredAppSettings(settings: AppSettings): Record<string, unknown> {
  const { extra, ...known } = settings;
  return { ...known, ...extra };
}

export async function loadAppSettings(platform: PlatformAdapter): Promise<AppSettings> {
  try {
    return parseAppSettings(await platform.loadAppSettings());
  } catch {
    // Settings are a convenience; failing to read them must not block start-up.
    return defaultAppSettings();
  }
}

export function saveAppSettings(platform: PlatformAdapter, settings: AppSettings): Promise<void> {
  return platform.saveAppSettings(toStoredAppSettings(settings));
}
