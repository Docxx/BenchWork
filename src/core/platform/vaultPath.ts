import { PlatformError } from './errors';

// Same rules as src-tauri/src/path_guard.rs. Both are tested against
// vault-path-cases.json, so change the cases file when changing either.

const RESERVED_NAMES = new Set([
  'CON',
  'PRN',
  'AUX',
  'NUL',
  ...Array.from({ length: 9 }, (_, i) => `COM${String(i + 1)}`),
  ...Array.from({ length: 9 }, (_, i) => `LPT${String(i + 1)}`),
]);

const FORBIDDEN_CHARS = /[\u0000-\u001f<>:"|?*]/;

function invalid(path: string, reason: string): PlatformError {
  return new PlatformError('InvalidPath', `Invalid path '${path}': ${reason}`);
}

function checkName(path: string, name: string): void {
  const bad = FORBIDDEN_CHARS.exec(name);
  if (bad) throw invalid(path, `contains '${JSON.stringify(bad[0]).slice(1, -1)}'`);
  if (name.endsWith('.') || name.endsWith(' ')) {
    throw invalid(path, 'a name may not end with a dot or space');
  }
  const base = name.split('.')[0] ?? name;
  if (RESERVED_NAMES.has(base.toUpperCase())) {
    throw invalid(path, `'${name}' is a reserved name on Windows`);
  }
}

/**
 * Checks a vault-relative path and returns its normal form: no leading,
 * trailing or doubled slashes and no `.` segments. `""` is the vault root.
 * Throws a PlatformError for anything that could leave the vault or that
 * Windows cannot store.
 */
export function normaliseVaultPath(path: string): string {
  if (path.includes('\\')) throw invalid(path, "use '/' as the separator");
  if (path.startsWith('/')) throw invalid(path, 'paths must be relative to the vault');
  const parts: string[] = [];
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      throw new PlatformError('OutsideVault', `Path '${path}' may not use '..'`);
    }
    checkName(path, part);
    parts.push(part);
  }
  return parts.join('/');
}

export function joinVaultPath(dir: string, name: string): string {
  return normaliseVaultPath(dir === '' ? name : `${dir}/${name}`);
}

/** Parent folder of a normalised path. The root's parent is null. */
export function parentVaultPath(path: string): string | null {
  if (path === '') return null;
  const i = path.lastIndexOf('/');
  return i === -1 ? '' : path.slice(0, i);
}

export function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}
