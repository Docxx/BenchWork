import { isTauri } from '@tauri-apps/api/core';
import type { StudioArchive } from './storage';

/** Native exports create a new folder; existing user files are never overwritten. */
export async function exportToFolder(archive: StudioArchive): Promise<string | null | false> {
  if (!isTauri()) return false;
  const { TauriAdapter } = await import('@core/platform/tauri');
  const target = new TauriAdapter();
  const parent = await target.pickFolder({
    title: 'Choose where to export your separate BenchWork Next workspace',
  });
  if (parent === null) return null;
  await target.setVaultRoot(parent);
  const base = `BenchWork Next ${new Date().toISOString().slice(0, 10)}`;
  let folder = base;
  for (let i = 2; await target.exists(folder); i += 1) folder = `${base} (${String(i)})`;
  await target.ensureDir(folder);
  await target.writeTextAtomic(`${folder}/BenchWork Next.json`, JSON.stringify(archive, null, 2));
  await target.ensureDir(`${folder}/Vault`);
  for (const entry of archive.entries.filter((e) => e.data === null))
    await target.ensureDir(`${folder}/Vault/${entry.path}`);
  for (const entry of archive.entries) {
    if (entry.data === null) continue;
    const path = `${folder}/Vault/${entry.path}`;
    const slash = path.lastIndexOf('/');
    await target.ensureDir(path.slice(0, slash));
    await target.writeBytes(
      path,
      Uint8Array.from(atob(entry.data), (c) => c.charCodeAt(0)),
    );
  }
  return `${parent}/${folder}`;
}
