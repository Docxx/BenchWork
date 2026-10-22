import type { DeviceKind } from '../platform';

/** The contents of a module's `manifest.json`, after validation. */
export interface ModuleManifest {
  /** Lower-case letters, digits and dashes; must match the module's folder name. */
  id: string;
  name: string;
  /** Semantic version, such as `0.1.0`. */
  version: string;
  description: string;
  /** Modules that must be on before this one. */
  dependsOn: string[];
  platforms: DeviceKind[];
  /** Whether a vault that has never seen this module starts with it on. */
  defaultEnabled: boolean;
}

export type ManifestResult =
  { ok: true; manifest: ModuleManifest } | { ok: false; errors: string[] };

export const MODULE_ID_PATTERN = /^[a-z][a-z0-9-]{0,39}$/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const PLATFORMS: readonly DeviceKind[] = ['desktop', 'tablet'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Checks a parsed manifest.json. `folder` is the module's folder name, which
 * the id must match. `dependsOn`, `platforms` and `defaultEnabled` may be left
 * out; unknown keys are ignored so newer manifests still load.
 */
export function validateManifest(data: unknown, folder: string): ManifestResult {
  if (!isRecord(data)) return { ok: false, errors: ['manifest.json must contain a JSON object'] };
  const errors: string[] = [];

  const id = data['id'];
  if (typeof id !== 'string' || !MODULE_ID_PATTERN.test(id)) {
    errors.push('"id" must be lower-case letters, digits and dashes, starting with a letter');
  } else if (id !== folder) {
    errors.push(`"id" is "${id}" but the folder is "${folder}"; they must match`);
  }

  const name = data['name'];
  if (typeof name !== 'string' || name.trim() === '' || name.length > 60) {
    errors.push('"name" must be a short piece of text');
  }

  const version = data['version'];
  if (typeof version !== 'string' || !VERSION_PATTERN.test(version)) {
    errors.push('"version" must look like 1.2.3');
  }

  const description = data['description'];
  if (typeof description !== 'string') errors.push('"description" must be text');

  const dependsOn = data['dependsOn'] ?? [];
  if (
    !Array.isArray(dependsOn) ||
    !dependsOn.every((d): d is string => typeof d === 'string' && MODULE_ID_PATTERN.test(d))
  ) {
    errors.push('"dependsOn" must be a list of module ids');
  } else if (typeof id === 'string' && dependsOn.includes(id)) {
    errors.push('A module cannot depend on itself');
  } else if (new Set(dependsOn).size !== dependsOn.length) {
    errors.push('"dependsOn" lists a module twice');
  }

  const platforms = data['platforms'] ?? [...PLATFORMS];
  if (
    !Array.isArray(platforms) ||
    platforms.length === 0 ||
    !platforms.every((p) => (PLATFORMS as readonly unknown[]).includes(p))
  ) {
    errors.push('"platforms" must list "desktop", "tablet" or both');
  }

  const defaultEnabled = data['defaultEnabled'] ?? false;
  if (typeof defaultEnabled !== 'boolean') errors.push('"defaultEnabled" must be true or false');

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    manifest: {
      id: id as string,
      name: (name as string).trim(),
      version: version as string,
      description: description as string,
      dependsOn: [...(dependsOn as string[])],
      platforms: [...new Set(platforms as DeviceKind[])],
      defaultEnabled: defaultEnabled as boolean,
    },
  };
}
