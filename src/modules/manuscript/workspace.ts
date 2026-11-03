import type { ModuleContext, PageTypeSpec } from '@core/api';

export const WRITING = 'manuscript.workspace';
export const SECTION = 'writing-section';
export const STATUSES = ['planned', 'drafting', 'review', 'complete'];

export function sectionType(): PageTypeSpec {
  return {
    type: SECTION,
    name: 'Writing section',
    fields: [
      { key: 'aim', label: 'Section aim', kind: 'text' },
      { key: 'status', label: 'Status', kind: 'choice', options: STATUSES },
      { key: 'wordTarget', label: 'Word target', kind: 'text' },
      { key: 'evidence', label: 'Evidence notes', kind: 'links', linkType: 'evidence' },
      { key: 'analyses', label: 'Analysis runs', kind: 'links', linkType: 'analysis' },
    ],
  };
}

export async function createWriting(
  ctx: ModuleContext,
  title: string,
  kind: string,
): Promise<string | null> {
  if (!title.trim()) throw new Error('Add a manuscript title.');
  await ctx.vault.ensureDir('Writing');
  return ctx.app.createPage('Writing', title.trim(), 'manuscript', {
    properties: { manuscriptKind: kind },
    body: `# ${title.trim()}\n\n`,
  });
}

export async function attachSection(
  ctx: ModuleContext,
  manuscript: string,
  section: string,
): Promise<void> {
  const target = await ctx.app.linkTarget(section);
  const source = await ctx.vault.readText(manuscript);
  if (!source.includes(`[[${target}]]`))
    await ctx.app.appendToPage(manuscript, `\n- [[${target}]]\n`);
}

export async function createSection(
  ctx: ModuleContext,
  manuscript: string,
  title: string,
): Promise<string | null> {
  if (!title.trim()) throw new Error('Add a section title.');
  const parent = manuscript.includes('/') ? manuscript.slice(0, manuscript.lastIndexOf('/')) : '';
  const folder = parent ? `${parent}/Sections` : 'Sections';
  await ctx.vault.ensureDir(folder);
  const path = await ctx.app.createPage(folder, title.trim(), SECTION, {
    properties: { status: 'planned', wordTarget: '', evidence: [], analyses: [] },
    body: `# ${title.trim()}\n\n`,
  });
  if (path) await attachSection(ctx, manuscript, path);
  return path;
}

export function linkedPaths(value: unknown): string[] {
  return Array.isArray(value)
    ? value.flatMap((v) => (typeof v === 'string' ? [/^\[\[(.*?)\]\]$/.exec(v)?.[1] ?? v] : []))
    : [];
}

export async function saveSectionLinks(
  ctx: ModuleContext,
  section: string,
  data: { aim: string; status: string; wordTarget: string; evidence: string[]; analyses: string[] },
): Promise<void> {
  if (!STATUSES.includes(data.status)) throw new Error('Choose a section status.');
  if (data.wordTarget && !/^\d+$/.test(data.wordTarget))
    throw new Error('Word target must be a whole number.');
  await ctx.app.setPageProperties(section, {
    ...data,
    evidence: data.evidence.map((p) => `[[${p}]]`),
    analyses: data.analyses.map((p) => `[[${p}]]`),
  });
}
