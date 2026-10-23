import type { ModuleContext } from '@core/api';

/**
 * Data files can belong to dataset records (`<name>.dataset.yaml`, from the
 * Research module), which hold each file's size and SHA-256. Editing a file
 * changes its checksum, so the viewer says which datasets it is in and can
 * update their checksums after saving.
 */

export interface DatasetRef {
  path: string;
  title: string;
}

/** Whether a `files` entry, a path or `{ path, size, sha256 }`, is the file. */
function lists(entry: unknown, path: string): boolean {
  if (typeof entry === 'string') return entry.trim() === path;
  return (
    typeof entry === 'object' &&
    entry !== null &&
    (entry as Record<string, unknown>)['path'] === path
  );
}

function files(data: Record<string, unknown>): unknown[] {
  const list = data['files'];
  return Array.isArray(list) ? list : [];
}

/** The datasets that list `path` among their files. */
export async function datasetsWith(ctx: ModuleContext, path: string): Promise<DatasetRef[]> {
  const found: DatasetRef[] = [];
  for (const item of await ctx.app.items()) {
    if (item.type !== 'dataset') continue;
    const { data, error } = await ctx.vault.readRecord(item.path);
    if (error !== null) continue;
    if (files(data).some((f) => lists(f, path))) found.push({ path: item.path, title: item.title });
  }
  return found;
}

/** Writes the file's new size and checksum into each dataset that lists it. */
export async function updateChecksums(
  ctx: ModuleContext,
  datasets: readonly DatasetRef[],
  path: string,
): Promise<void> {
  const [sha256, info] = await Promise.all([ctx.vault.hashFile(path), ctx.vault.fileInfo(path)]);
  for (const dataset of datasets) {
    const { data, error } = await ctx.vault.readRecord(dataset.path);
    if (error !== null) continue;
    await ctx.vault.updateRecord(dataset.path, {
      files: files(data).map((f) =>
        lists(f, path)
          ? {
              ...(typeof f === 'object' ? (f as Record<string, unknown>) : {}),
              path,
              size: info.size,
              sha256,
            }
          : f,
      ),
    });
  }
}
