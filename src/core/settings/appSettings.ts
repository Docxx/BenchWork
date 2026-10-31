import { parseGrid, type Grid } from './homeGrid';
import { defaultDocks, parseDocks, type DockLayout } from './layout';
import type { PlatformAdapter } from '../platform';
import { defaultAppearance, parseAppearance, type Appearance } from './appearance';

/**
 * Per-device settings, kept in the app's own config folder rather than the
 * vault, so a PC and a tablet sharing one vault can differ.
 */
export type Theme = 'system' | 'light' | 'dark';

/** How often a vault is backed up. */
export type BackupEvery = 'off' | 'day' | 'week';

/** Backups of one vault, from this device. */
export interface BackupPlan {
  /** Full path of the folder backups go in, outside the vault; null until chosen. */
  folder: string | null;
  every: BackupEvery;
  /** How many backups to keep; older ones go to the Recycle Bin. */
  keep: number;
  /** When the last backup was made, as an ISO time; null for never. */
  last: string | null;
}

/** How Home and the docks look for one vault on this device. */
export interface HomeLayout {
  /** Card ids in the order shown; cards not listed follow in their usual order. */
  order: string[];
  hidden: string[];
  /** Widgets added to Home that do not start there. */
  added: string[];
  /** Pages pinned to Home, by path. */
  pinned: string[];
  /** Widgets under the notebooks and beside pages. */
  docks: DockLayout;
  /** Where each card is on Home, and its size. */
  grid: Grid;
}

export function defaultHomeLayout(): HomeLayout {
  return { order: [], hidden: [], added: [], pinned: [], docks: defaultDocks(), grid: {} };
}

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];

export function parseHomeLayout(value: unknown): HomeLayout {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return defaultHomeLayout();
  }
  const record = value as Record<string, unknown>;
  return {
    order: strings(record['order']),
    hidden: strings(record['hidden']),
    added: strings(record['added']),
    pinned: strings(record['pinned']),
    docks: parseDocks(record['docks']),
    grid: parseGrid(record['grid']),
  };
}

export const BACKUP_KEEP_RANGE = { min: 1, max: 100 } as const;

export function defaultBackupPlan(): BackupPlan {
  return { folder: null, every: 'week', keep: 10, last: null };
}

function parseBackupPlan(data: unknown): BackupPlan | null {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;
  const r = data as Record<string, unknown>;
  const plan = defaultBackupPlan();
  if (typeof r['folder'] === 'string' && r['folder'] !== '') plan.folder = r['folder'];
  if (r['every'] === 'off' || r['every'] === 'day' || r['every'] === 'week')
    plan.every = r['every'];
  const keep = r['keep'];
  if (typeof keep === 'number' && Number.isInteger(keep)) {
    plan.keep = Math.min(BACKUP_KEEP_RANGE.max, Math.max(BACKUP_KEEP_RANGE.min, keep));
  }
  if (typeof r['last'] === 'string' && !Number.isNaN(Date.parse(r['last']))) plan.last = r['last'];
  return plan;
}

/** What writing with a pen does: draws ink, or lets the system turn handwriting into text. */
export type PenMode = 'draw' | 'text';

export interface AppSettings {
  version: 1;
  /** Full path of the last vault opened on this device. */
  lastVault: string | null;
  theme: Theme;
  /** Show every file in the sidebar, not just pages. */
  showAllFiles: boolean;
  /** Theme preset, colours, fonts and sizes. */
  appearance: Appearance;
  penMode: PenMode;
  /** Module panels in the sidebar that are open; the rest stay folded. */
  openPanels: string[];
  /** Backups from this device, by the vault's full path. */
  backups: Record<string, BackupPlan>;
  /** Home's cards and pinned pages, by the vault's full path. */
  home: Record<string, HomeLayout>;
  /** The first-run guide has been seen, or skipped, on this device. */
  guided: boolean;
  /** Keys this version does not know about, kept on save. */
  extra: Record<string, unknown>;
}

const THEMES: readonly Theme[] = ['system', 'light', 'dark'];
const KNOWN_KEYS = new Set([
  'version',
  'lastVault',
  'theme',
  'showAllFiles',
  'appearance',
  'penMode',
  'openPanels',
  'backups',
  'home',
  'guided',
]);

export function defaultAppSettings(): AppSettings {
  return {
    version: 1,
    lastVault: null,
    theme: 'system',
    showAllFiles: false,
    appearance: defaultAppearance(),
    penMode: 'draw',
    openPanels: [],
    backups: {},
    home: {},
    guided: false,
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
  if (record['penMode'] === 'draw' || record['penMode'] === 'text') {
    settings.penMode = record['penMode'];
  }
  const backups = record['backups'];
  if (typeof backups === 'object' && backups !== null && !Array.isArray(backups)) {
    for (const [root, plan] of Object.entries(backups)) {
      const parsed = parseBackupPlan(plan);
      if (parsed) settings.backups[root] = parsed;
    }
  }
  const home = record['home'];
  if (typeof home === 'object' && home !== null && !Array.isArray(home)) {
    for (const [root, layout] of Object.entries(home)) {
      settings.home[root] = parseHomeLayout(layout);
    }
  }
  // Settings from before the guide existed belong to someone who has used BenchWork.
  const guided = record['guided'];
  settings.guided = typeof guided === 'boolean' ? guided : settings.lastVault !== null;
  const openPanels = record['openPanels'];
  if (Array.isArray(openPanels)) {
    settings.openPanels = openPanels.filter((p): p is string => typeof p === 'string');
  }

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
