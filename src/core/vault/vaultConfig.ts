/**
 * `.benchwork/config.json`: per-vault settings and which modules are on.
 *
 * Keys this version does not understand are kept and written back unchanged,
 * so a newer BenchWork, or a module that is switched off, never loses data
 * when an older or different build saves the file.
 */

export const VAULT_DIR = '.benchwork';
export const VAULT_CONFIG_PATH = `${VAULT_DIR}/config.json`;
export const CONFIG_VERSION = 1;
export const DEFAULT_LINK_THRESHOLD_MB = 50;

export interface ModuleConfig {
  enabled: boolean;
  [key: string]: unknown;
}

export interface AttachmentsConfig {
  /** Files larger than this are linked rather than copied into the vault. */
  linkThresholdMB: number;
  [key: string]: unknown;
}

/** How new pages start: flowing like a document, or with text placed anywhere. */
export type PageLayout = 'document' | 'free';

export interface PagesConfig {
  [key: string]: unknown;
  /** The layout new pages start with. */
  layout: PageLayout;
}

export interface VaultConfig {
  version: typeof CONFIG_VERSION;
  modules: Record<string, ModuleConfig>;
  attachments: AttachmentsConfig;
  pages: PagesConfig;
  /** Top-level keys this version does not know about. */
  extra: Record<string, unknown>;
}

export class VaultConfigError extends Error {
  override readonly name = 'VaultConfigError';
}

const KNOWN_KEYS = new Set(['version', 'modules', 'attachments', 'pages']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function defaultVaultConfig(): VaultConfig {
  return {
    version: CONFIG_VERSION,
    modules: {},
    attachments: { linkThresholdMB: DEFAULT_LINK_THRESHOLD_MB },
    pages: { layout: 'document' },
    extra: {},
  };
}

/**
 * Reads config.json text. Throws VaultConfigError if the file is not JSON,
 * not an object, or was written by a newer BenchWork; fields with the wrong
 * type fall back to their defaults.
 */
export function parseVaultConfig(text: string): VaultConfig {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new VaultConfigError(
      `${VAULT_CONFIG_PATH} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!isRecord(data)) {
    throw new VaultConfigError(`${VAULT_CONFIG_PATH} must contain a JSON object`);
  }
  const version = data['version'];
  if (typeof version === 'number' && version > CONFIG_VERSION) {
    throw new VaultConfigError(
      `This vault was set up by a newer version of BenchWork (settings version ${String(version)})`,
    );
  }

  const config = defaultVaultConfig();

  const modules = data['modules'];
  if (isRecord(modules)) {
    for (const [id, value] of Object.entries(modules)) {
      if (isRecord(value) && typeof value['enabled'] === 'boolean') {
        config.modules[id] = { ...value, enabled: value['enabled'] };
      }
    }
  }

  const attachments = data['attachments'];
  if (isRecord(attachments)) {
    const threshold = attachments['linkThresholdMB'];
    config.attachments = {
      ...attachments,
      linkThresholdMB:
        typeof threshold === 'number' && Number.isFinite(threshold) && threshold > 0
          ? threshold
          : DEFAULT_LINK_THRESHOLD_MB,
    };
  }

  const pages = data['pages'];
  if (isRecord(pages)) {
    config.pages = { ...pages, layout: pages['layout'] === 'free' ? 'free' : 'document' };
  }

  for (const [key, value] of Object.entries(data)) {
    if (!KNOWN_KEYS.has(key)) config.extra[key] = value;
  }
  return config;
}

export function serialiseVaultConfig(config: VaultConfig): string {
  const { extra, pages, ...known } = config;
  // Left out while it says only the default, so older vaults' files do not change.
  const plainPages = Object.keys(pages).length === 1 && pages.layout === 'document';
  return `${JSON.stringify({ ...known, ...(plainPages ? {} : { pages }), ...extra }, null, 2)}\n`;
}
