import type { ModuleContext, PageTypeSpec } from '@core/api';
import { assemble, partTargets, wordCount, type Part } from './assemble';

/**
 * Manuscripts: pages of type `manuscript` whose links, in order, are its
 * parts. Exporting joins the parts and asks Pandoc for a Word file.
 */

export const MANUSCRIPT = 'manuscript';
export const EXPORTS = 'exports';
const SETTINGS_FILE = 'settings.json';

export interface ManuscriptSettings {
  /** A `.csl` citation style in the vault, or null for Pandoc's own (Chicago author-date). */
  style: string | null;
}

export async function readSettings(ctx: ModuleContext): Promise<ManuscriptSettings> {
  const saved = await ctx.storage
    .read<Partial<ManuscriptSettings>>(SETTINGS_FILE)
    .catch(() => null);
  return { style: typeof saved?.style === 'string' ? saved.style : null };
}

export async function saveSettings(
  ctx: ModuleContext,
  settings: ManuscriptSettings,
): Promise<void> {
  await ctx.storage.write(SETTINGS_FILE, settings);
}

export function manuscriptType(): PageTypeSpec {
  return {
    type: MANUSCRIPT,
    name: 'Manuscript',
    fields: [
      { key: 'author', label: 'Author', kind: 'text' },
      { key: 'style', label: 'Citation style', kind: 'text' },
    ],
    create: () => ({
      body: [
        'The parts of this manuscript, in order. Each is a page; link to it here.',
        '',
        '1. [[Introduction]]',
        '2. [[Methods]]',
        '3. [[Results]]',
        '4. [[Discussion]]',
        '',
      ].join('\n'),
    }),
  };
}

export interface PartInfo {
  /** As written in the manuscript. */
  target: string;
  /** The page it means, or null if there is no such page yet. */
  path: string | null;
  title: string;
  words: number;
  text: string;
}

export interface ManuscriptInfo {
  path: string;
  title: string;
  author: string | null;
  /** This manuscript's own citation style, if its `style` property names one. */
  style: string | null;
  parts: PartInfo[];
}

function titleOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1).replace(/\.md$/i, '');
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/** A manuscript's parts, each found and read. */
export async function readManuscript(ctx: ModuleContext, path: string): Promise<ManuscriptInfo> {
  const props = (await ctx.app.pageProperties(path)) ?? {};
  const source = await ctx.vault.readText(path);
  const parts: PartInfo[] = [];
  for (const target of partTargets(source)) {
    const found = await ctx.app.resolveLink(target, path);
    const partText = found === null ? '' : await ctx.vault.readText(found).catch(() => '');
    parts.push({
      target,
      path: found,
      title: found === null ? target : titleOf(found),
      words: wordCount(partText),
      text: partText,
    });
  }
  return {
    path,
    title: text(props['title']) ?? titleOf(path),
    author: text(props['author']),
    style: text(props['style']),
    parts,
  };
}

function stamp(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${String(now.getFullYear())}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
    `${pad(now.getHours())}${pad(now.getMinutes())}`
  );
}

export interface ExportResult {
  output: string;
  missing: string[];
  cited: boolean;
}

/**
 * Exports a manuscript to `exports/<title> <date time>.docx`. A new file
 * each time, so a copy edited in Word is never replaced. Parts that do
 * not exist yet are left out and listed.
 */
export async function exportManuscript(
  ctx: ModuleContext,
  path: string,
  now: Date = new Date(),
): Promise<ExportResult> {
  if ((await ctx.pandoc.version()) === null) {
    throw new Error(
      'Pandoc is not installed, so there is nothing to make the Word file with. Install it with: winget install JohnMacFarlane.Pandoc',
    );
  }
  const info = await readManuscript(ctx, path);
  const found: Part[] = info.parts
    .filter((p): p is PartInfo & { path: string } => p.path !== null)
    .map((p) => ({ title: p.title, path: p.path, text: p.text }));
  const { markdown } = assemble(info.title, info.author, found);

  const bibliography = ctx.citations.bibliography();
  const style = info.style ?? (await readSettings(ctx)).style;
  await ctx.vault.ensureDir(EXPORTS);
  const safe =
    info.title.replace(/[\u0000-\u001f<>:"/\\|?*]/g, '-').replace(/[. ]+$/, '') || 'Manuscript';
  const name = await ctx.vault.freeName(EXPORTS, `${safe} ${stamp(now)}`, '.docx');
  const output = `${EXPORTS}/${name}`;
  await ctx.pandoc.toWord({
    markdown,
    output,
    ...(bibliography === null ? {} : { bibliography }),
    ...(style === null ? {} : { csl: style }),
  });
  return {
    output,
    missing: info.parts.filter((p) => p.path === null).map((p) => p.target),
    cited: bibliography !== null,
  };
}

/** Says what an export did, in a sentence or two. */
export function exportMessage(result: ExportResult): string {
  const parts = [`Saved ${result.output}.`];
  if (result.missing.length > 0) {
    parts.push(`Left out, as they do not exist yet: ${result.missing.join(', ')}.`);
  }
  if (!result.cited) {
    parts.push(
      'Citations stay as keys: switch on References and choose its library to format them.',
    );
  }
  return parts.join(' ');
}
