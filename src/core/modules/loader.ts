import type { ModuleDefinition } from '../api';
import { validateManifest } from './manifest';
import type { BrokenModule, ModuleSource } from './registry';

export interface FoundModules {
  sources: ModuleSource[];
  broken: BrokenModule[];
}

/** `../../modules/hello/manifest.json` → `hello`. */
function folderOf(path: string): string {
  const parts = path.split('/');
  return parts[parts.length - 2] ?? path;
}

/**
 * Pairs each module folder's manifest with its code. Kept separate from
 * `import.meta.glob` so it can be tested with plain objects.
 *
 * @param manifests manifest.json contents by file path
 * @param entries   lazy imports of index.ts by file path
 */
export function collectModules(
  manifests: Record<string, unknown>,
  entries: Record<string, () => Promise<unknown>>,
): FoundModules {
  const loaders = new Map(Object.entries(entries).map(([path, load]) => [folderOf(path), load]));
  const sources: ModuleSource[] = [];
  const broken: BrokenModule[] = [];

  for (const [path, data] of Object.entries(manifests)) {
    const folder = folderOf(path);
    const result = validateManifest(data, folder);
    const load = loaders.get(folder);
    if (!result.ok) {
      broken.push({ folder, errors: result.errors });
    } else if (!load) {
      broken.push({ folder, errors: ['The folder has no index.ts'] });
    } else {
      sources.push({
        manifest: result.manifest,
        load: async () => {
          const loaded = (await load()) as { default?: ModuleDefinition };
          if (!loaded.default) throw new Error('index.ts has no default export');
          return loaded.default;
        },
      });
    }
  }
  return {
    sources: sources.sort((a, b) => a.manifest.name.localeCompare(b.manifest.name, 'en-GB')),
    broken,
  };
}

/** The modules built into the app, from src/modules/<id>/. */
export function findBuiltInModules(): FoundModules {
  const manifests = import.meta.glob<unknown>('../../modules/*/manifest.json', {
    eager: true,
    import: 'default',
  });
  const entries = import.meta.glob('../../modules/*/index.ts');
  return collectModules(manifests, entries);
}
