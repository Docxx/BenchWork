import type { ModuleContext } from '@core/api';
export interface PdfLibrarySettings {
  folder: string | null;
  recursive: boolean;
}
export function parsePdfLibrary(value: unknown): PdfLibrarySettings {
  const data = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return {
    folder: typeof data['folder'] === 'string' ? data['folder'] : null,
    recursive: data['recursive'] !== false,
  };
}
export async function paperPaths(
  ctx: ModuleContext,
  folder: string,
  recursive: boolean,
): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await ctx.vault.listDir(folder)) {
    if (entry.name.startsWith('.')) continue;
    const path = folder ? `${folder}/${entry.name}` : entry.name;
    if (entry.isDir && recursive) result.push(...(await paperPaths(ctx, path, true)));
    else if (!entry.isDir && /\.pdf$/i.test(entry.name)) result.push(path);
  }
  return result.sort((a, b) => a.localeCompare(b));
}

let saving = Promise.resolve();
export async function filePaper(
  ctx: ModuleContext,
  folder: string,
  recursive: boolean,
  title: string,
  bytes: Uint8Array,
) {
  if (bytes.length > 64 * 1024 * 1024) throw new Error('The PDF exceeds the reader’s 64 MB limit.');
  if (!new TextDecoder().decode(bytes.subarray(0, 1024)).includes('%PDF-'))
    throw new Error('Choose a PDF file or a direct PDF download link.');
  const base =
    title
      .replace(/\.pdf$/i, '')
      .replace(/[<>:"/\\|?*]/g, ' ')
      .replace(/[. ]+$/, '')
      .trim()
      .slice(0, 120) || 'Paper';
  const run = saving.then(async () => {
    if (folder) await ctx.vault.ensureDir(folder);
    const hash = Array.from(
      new Uint8Array(await crypto.subtle.digest('SHA-256', bytes.slice())),
      (byte) => byte.toString(16).padStart(2, '0'),
    ).join('');
    for (const existing of await paperPaths(ctx, folder, recursive)) {
      if (
        (await ctx.vault.fileInfo(existing)).size === bytes.length &&
        (await ctx.vault.hashFile(existing)) === hash
      )
        return existing;
    }
    const name = await ctx.vault.freeName(folder, base, '.pdf');
    const path = folder ? folder + '/' + name : name;
    await ctx.vault.writeBytes(path, bytes);
    return path;
  });
  saving = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}
