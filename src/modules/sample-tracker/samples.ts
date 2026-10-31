import type { ModuleContext } from '@core/api';
import { link, values, type Entry } from '../research/api';

export async function ancestry(
  ctx: ModuleContext,
  entry: Entry,
  entries: Entry[],
): Promise<Entry[]> {
  const found: Entry[] = [];
  const seen = new Set<string>([entry.path]);
  async function visit(current: Entry): Promise<void> {
    for (const value of [...values(current.data['parents']), ...values(current.data['source'])]) {
      const path = await ctx.app.resolveLink(value.replace(/^\[\[|\]\]$/g, ''), current.path);
      if (!path || seen.has(path)) continue;
      seen.add(path);
      if (seen.size > 256) throw new Error('This lineage is too large to display at once.');
      const parent = entries.find((e) => e.path === path);
      if (parent) {
        found.push(parent);
        await visit(parent);
      }
    }
  }
  await visit(entry);
  return found;
}
export async function validateParents(
  ctx: ModuleContext,
  data: Record<string, unknown>,
  entries: Entry[],
  current: Entry | null,
): Promise<string | null> {
  if (!current) return null;
  const candidate = { ...current, data };
  for (const value of values(data['parents'])) {
    const path = await ctx.app.resolveLink(value.replace(/^\[\[|\]\]$/g, ''), current.path);
    if (path === current.path) return 'A sample cannot be its own parent.';
    const parent = entries.find((e) => e.path === path);
    if (parent && (await ancestry(ctx, parent, entries)).some((e) => e.path === candidate.path))
      return 'Those parents would create a lineage cycle.';
  }
  return null;
}
export async function aliquots(ctx: ModuleContext, entry: Entry, count: number): Promise<string[]> {
  if (!Number.isInteger(count) || count < 1 || count > 96)
    throw new Error('Choose 1 to 96 aliquots.');
  await ctx.vault.ensureDir('Research/Samples');
  const paths: string[] = [];
  for (let i = 1; i <= count; i += 1) {
    try {
      paths.push(
        await ctx.vault.createRecord(
          'Research/Samples',
          `${entry.title} aliquot ${String(i)}`,
          'sample',
          {
            parents: [link(entry.path)],
            experiment: entry.data['experiment'] ?? '',
            treatment: entry.data['treatment'] ?? '',
            location: entry.data['location'] ?? '',
            status: 'stored',
            notes: `Derived from ${entry.title}.`,
          },
        ),
      );
    } catch (error) {
      throw new Error(
        `Created ${String(paths.length)} aliquots before the write failed. Existing records were kept. ${String(error)}`,
      );
    }
  }
  ctx.app.notify(`Created ${String(paths.length)} aliquots from ${entry.title}.`);
  return paths;
}
